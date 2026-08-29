"""
WebSocket Router cho Mock Room AI Q&A.

Endpoint: /api/mock-qa/{meeting_id}/ws

Message Flow:
Client -> Server:
  {"type": "answer", "content": "..."}   # student: gửi cho AI đánh giá
  {"type": "chat", "content": "..."}     # mentor/student: chat thường (không gửi AI)
  {"type": "hint_request", "level": 1}
  {"type": "get_status"}

Server -> Client:
  {"type": "question", "question_id": "...", "question": "...", "clo": "CLO1", "type": "Deep-dive", "difficulty": "Medium"}
  {"type": "feedback", "feedback": "...", "quality_criteria_met": [...], "criteria_not_met": [...], "confidence": 0.9}
  {"type": "coverage_update", "coverage": {"CLO1": 2, "CLO2": 1}}
  {"type": "hint", "hint": "...", "level": 1}
  {"type": "done", "summary": {...}}  # KHÔNG có oga_final/tda_final (không chấm điểm)
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
from app.core.database import get_db, async_session_maker
from app.core.deps import get_current_user
from app.models.user import User
from app.services.mock_qa_engine import MockQAEngine
from app.services.mock_qa_state import MockQASessionManager, SessionState
from app.services.mock_qa_rag import MockQARAGService
from app.services.rag_service import RAGService
from app.models.booking import MockBooking, BookingStatus
from app.models.meeting import Meeting

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
        
        rag = RAGService()
        rag_qa = MockQARAGService(rag)
        _qa_engine = MockQAEngine(rag_service=rag)
    return _qa_engine


async def get_session_manager():
    global _session_manager
    if _session_manager is None:
        from app.services.mock_qa_state import MockQASessionManager
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
    - {"type": "feedback", "feedback": "...", "quality_criteria_met": [...], "criteria_not_met": [...], "confidence": 0.9}
    - {"type": "coverage_update", "coverage": {"CLO1": 2, "CLO2": 1}}
    - {"type": "hint", "hint": "...", "level": 1}
    - {"type": "done", "summary": {...}}  # KHÔNG có oga_final/tda_final (không chấm điểm)
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
        from sqlalchemy import select

        # Tìm booking liên kết với meeting này (cả student lẫn mentor đều được vào)
        booking = await db.execute(
            select(MockBooking).where(MockBooking.meeting_id == meeting_id)
        )
        booking = booking.scalar_one_or_none()

        if not booking:
            await websocket.close(code=4003, reason="Meeting not found or access denied")
            return

        # Chỉ mở khi booking đã confirmed (student & mentor đã chốt xong lịch).
        # Khoá lại khi mentor xác nhận kết thúc (completed).
        if booking.status != BookingStatus.confirmed:
            await websocket.close(code=4003, reason=f"Booking not confirmed: {booking.status.value}")
            return

        # Chỉ student hoặc mentor của booking này mới được vào phòng
        is_participant = (
            booking.student_id == user.id or booking.mentor_id == user.id
        )
        if not is_participant:
            await websocket.close(code=4003, reason="Not a participant of this meeting")
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
            "q_type": "Deep-dive",
            "difficulty": "Medium",
        })
        
        # Update session state
        from app.services.mock_qa_state import SessionState
        session.state = "questioning"
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
            
            elif msg_type == "chat":
                # Tin nhắn chat thường (mentor hoặc student) — không gửi cho AI.
                # Hiện tại chỉ echo lại cho chính client (để đồng bộ UI). Có thể
                # mở rộng broadcast cho peer qua signaling WS nếu cần.
                await websocket.send_json({
                    "type": "chat_echo",
                    "content": message.get("content", ""),
                    "sender_role": "mentor" if getattr(user, "roles", []) and "mentor" in user.roles else "student",
                })
            
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
    except Exception as e:
        logger.exception(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


async def handle_answer(websocket: WebSocket, session: object, answer: str):
    """Process student answer.

    Lưu ý: hệ thống KHÔNG chấm điểm số. Hội đồng AI và mentor chỉ đưa ra
    NHẬN XÉT định tính dựa trên rubric (tiêu chí theo trường ĐH). Do đó WS
    chỉ gửi `feedback` (nhận xét) + `coverage` (CLO đã hỏi), không gửi
    oga_score / tda_score / score_update.
    """
    qa_engine = get_qa_engine()
    
    # Get workspace_id from session
    workspace_id = session.workspace_id
    try:
        result = await qa_engine.process_answer(session, answer, workspace_id)
        
        # Send qualitative feedback (KHÔNG có điểm số)
        await websocket.send_json({
            "type": "feedback",
            "feedback": result.get("feedback", ""),
            "quality_criteria_met": result.get("quality_criteria_met", []),
            "criteria_not_met": result.get("criteria_not_met", []),
            "confidence": result.get("confidence", 0.0),
        })
        
        # Send CLO coverage update (KHÔNG có điểm số)
        await websocket.send_json({
            "type": "coverage_update",
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
            "q_type": next_question.get("type", "Deep-dive"),
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
    """Send session completion summary.

    KHÔNG chứa điểm số (oga_final/tda_final) — chỉ nhận xét định tính theo rubric.
    """
    summary = {
        "session_id": "session_id",
        "duration_minutes": 30,
        "total_questions": 10,
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