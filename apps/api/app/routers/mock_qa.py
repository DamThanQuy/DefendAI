"""
WebSocket Router cho Mock Room AI Q&A.

Endpoint: /api/mock-qa/{meeting_id}/ws

Message Flow:
Client -> Server:
  {"type": "answer", "content": "..."}
  {"type": "hint_request", "level": 1}
  {"type": "get_status"}

Server -> Client:
  {"type": "question", "question_id": "...", "question": "...", "clo": "CLO1", "type": "Deep-dive", "difficulty": "Medium"}
  {"type": "feedback", "oga_score": 7.5, "tda_score": 8.0, "feedback": "...", "quality_criteria_met": [...], "confidence": 0.9}
  {"type": "score_update", "oga": 7.2, "tda": 7.8, "coverage": {"CLO1": 2, "CLO2": 1}}
  {"type": "hint", "hint": "...", "level": 1}
  {"type": "score_update", "oga": 7.2, "tda": 7.8, "coverage": {"CLO1": 2}}
  {"type": "done", "summary": {...}}
  {"type": "error", "message": "..."}
"""

import json
import logging
import uuid
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.services.mock_qa_engine import MockQAEngine
from app.services.mock_qa_state import MockQASessionManager, SessionState
from app.services.mock_qa_rag import MockQARAGService
from app.services.rag_service import RAGService
from app.core.database import async_session_maker
from app.models.booking import MockBooking, BookingStatus
from app.models.meeting import Meeting
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mock-qa", tags=["Mock Q&A"])

# Initialize services
_qa_engine: Optional[MockQAEngine] = None
_rag_service: Optional[object] = None  # RAGService instance
_session_manager = None  # Will be initialized


def get_qa_engine() -> MockQAEngine:
    global _qa_engine
    if _qa_engine is None:
        from app.services.rag_service import RAGService
        from app.services.mock_qa_rag import MockQARAGService
        from app.services.rag_service import RAGService
        
        rag = RAGService()
        rag_qa = MockQARAGService(rag)
        _qa_engine = MockQAEngine(rag_service=rag)
    return _qa_engine


async def get_session_manager():
    global _session_manager
    from app.services.mock_qa_state import MockQASessionManager
    global _session_manager
    if _session_manager is None:
        _session_manager = MockQASessionManager()
    return _session_manager


@router.websocket("/{meeting_id}/ws")
async def mock_qa_websocket(
    websocket: WebSocket,
    meeting_id: int,
    token: str = Query(...),  # JWT token for auth
    db: AsyncSession = Depends(get_db),
):
    """
    WebSocket endpoint cho Mock Room AI Q&A.
    
    Message Types (Client -> Server):
    - {"type": "answer", "content": "..."}
    - {"type": "hint_request", "level": 1}
    - {"type": "get_status"}
    
    Server -> Client messages:
    - {"type": "question", "question_id": "...", "question": "...", "clo": "CLO1", "type": "Deep-dive", "difficulty": "Medium"}
    - {"type": "feedback", "oga_score": 7.5, "tda_score": 8.0, "feedback": "...", "quality_criteria_met": [...], "confidence": 0.9}
    - {"type": "score_update", "oga": 7.2, "tda": 7.8, "coverage": {"CLO1": 2, "CLO2": 1}}
    - {"type": "hint", "hint": "...", "level": 1}
    - {"type": "score_update", "oga": 7.2, "tda": 7.8, "coverage": {"CLO1": 2}}
    - {"type": "done", "summary": {...}}
    - {"type": "error", "message": "..."}
    """
    # 1. Authenticate user via token
    try:
        from app.core.deps import get_current_user_ws
        user = await get_current_user_ws(token, async_session_maker)
        if not user:
            await websocket.close(code=4001, reason="Invalid token")
            return
    except Exception as e:
        logger.warning(f"WebSocket auth failed: {e}")
        await websocket.close(code=4001, reason="Authentication failed")
        return
    
    # 2. Verify meeting access
    async with async_session_maker() as db:
        from app.models.meeting import MockBooking, BookingStatus
        from sqlalchemy import select
        
        booking = await db.execute(
            select(MockBooking).where(
                MockBooking.id == meeting_id,
                MockBooking.student_id == user.id,
            )
        )
        booking = booking.scalar_one_or_none()
        
        if not booking:
            await websocket.close(code=4003, reason="Meeting not found or access denied")
            return
        
        if booking.status != BookingStatus.confirmed:
            await websocket.close(code=4003, reason=f"Booking not confirmed: {booking.status.value}")
            return
        
        meeting_id = booking.meeting_id
    
    # 3. Accept WebSocket connection
    await websocket.accept()
    
    # Get or create session
    session_manager = await get_session_manager()
    session = await session_manager.create_session(
        meeting_id=meeting_id,
        workspace_id=user.workspace_id if hasattr(user, 'workspace_id') else 1,
    )
    
    # Initialize QA Engine
    qa_engine = get_qa_engine()
    
    # Send initial connection confirmation
    await websocket.send_json({
        "type": "connected",
        "session_id": session.session_id,
        "meeting_id": meeting_id,
        "message": "Connected to Mock Room Q&A",
    })
    
    # Send first question
    try:
        first_question = await generate_first_question(session_manager, session, user.workspace_id if hasattr(user, 'workspace_id') else 1)
        await websocket.send_json({
            "type": "question",
            "question_id": str(uuid.uuid4())[:8],
            "question": first_question,
            "clo": "CLO1",
            "type": "Deep-dive",
            "difficulty": "Medium",
        })
        
        # Update session state
        from app.services.mock_qa_state import SessionState
        session.state = "questioning"
        session.current_question = first_question
        session.current_clo = "CLO1"
        session.question_start_time = datetime.utcnow()
    
    except Exception as e:
        logger.exception("Failed to generate first question")
        await websocket.send_json({"type": "error", "message": str(e)})
        await websocket.close(code=4000, reason="Failed to start session")
        return
    
    # Main message loop
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue
            
            msg_type = message.get("type")
            
            if msg_type == "answer":
                await handle_answer(websocket, session, message.get("content", ""))
            
            elif msg_type == "hint_request":
                level = message.get("level", 1)
                await handle_hint_request(session, level)
            
            elif msg_type == "get_status":
                await send_status(websocket, session)
            
            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            
            else:
                await websocket.send_json({"type": "error", "message": f"Unknown message type: {msg_type}"})
    
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session.session_id}")
        # Save session state for potential reconnect
        await save_session_state(session)
    except Exception as e:
        logger.exception(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except:
            pass
        finally:
            await save_session_state(session)


async def handle_answer(websocket: WebSocket, session: object, answer: str):
    """Process student answer."""
    from app.services.mock_qa_engine import MockQAEngine
    
    qa_engine = get_qa_engine()
    
    # Get workspace_id from session
    workspace_id = session.workspace_id
    
    # Process answer through QA engine
    try:
        result = await qa_engine.process_answer(session, answer, workspace_id)
        
        # Send feedback
        await websocket.send_json({
            "type": "feedback",
            "oga_score": result.get("oga_score", 0),
            "tda_score": result.get("tda_score", 0),
            "feedback": result.get("feedback", ""),
            "quality_criteria_met": result.get("quality_criteria_met", []),
            "confidence": result.get("confidence", 0.0),
        })
        
        # Send score update
        await websocket.send_json({
            "type": "score_update",
            "oga": result.get("oga_total", 0),
            "tda": result.get("tda_total", 0),
            "coverage": result.get("coverage", {}),
        })
        
        # Check if session complete
        if result.get("completed", False):
            await send_completion(websocket, session)
            return
        
        # Generate next question
        next_question = await generate_next_question(session)
        await websocket.send_json({
            "type": "question",
            "question_id": str(uuid.uuid4())[:8],
            "question": next_question["question"],
            "clo": next_question.get("clo", "CLO1"),
            "type": next_question.get("type", "Deep-dive"),
            "difficulty": next_question.get("difficulty", "Medium"),
        })
        
    except Exception as e:
        logger.exception("Error processing answer")
        await websocket.send_json({"type": "error", "message": str(e)})


async def handle_hint_request(session: object, level: int):
    """Handle hint request from student."""
    # TODO: Implement hint generation
    pass


async def send_status(websocket: WebSocket, session: object):
    """Send current session status."""
    await websocket.send_json({
        "type": "status",
        "session_id": session.session_id,
        "state": "questioning",  # session.state
        "questions_asked": 0,  # session.questions_asked
        "coverage": {},  # session.coverage
        "current_clo": "CLO1",  # session.current_clo
    })


async def send_completion(websocket: WebSocket, session: object):
    """Send session completion summary."""
    summary = {
        "session_id": "session_id",
        "duration_minutes": 30,
        "total_questions": 10,
        "oga_final": 7.5,
        "tda_final": 8.0,
        "clo_coverage": {"CLO1": 2, "CLO2": 2},
        "strengths": ["SRS understanding", "Architecture knowledge"],
        "weaknesses": ["Test design", "Deployment knowledge"],
        "action_items": ["Review test case design (R5)", "Study deployment strategies (R4)"],
    }
    
    await websocket.send_json({
        "type": "done",
        "summary": summary,
    })


async def generate_first_question(session, workspace_id: int) -> str:
    """Generate first question for session."""
    return "Hãy trình bày tổng quan về hệ thống SMC-Ride mà bạn đã xây dựng, tập trung vào mục tiêu và phạm vi của dự án."


async def generate_next_question(session) -> dict:
    """Generate next question based on session state."""
    return {
        "question": "Tại sao chọn kiến trúc microservices thay vì monolith cho module này?",
        "clo": "CLO2",
        "type": "Deep-dive",
        "difficulty": "Hard",
    }


# Import needed
import json
import uuid
from datetime import datetime
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)