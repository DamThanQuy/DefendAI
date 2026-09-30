"""
WebSocket Router cho Mock Room AI Q&A.

Endpoint: /api/mock-qa/{meeting_id}/ws

Message Flow:
Client -> Server:
  {"type": "answer", "content": "..."}   # student: gửi cho AI đánh giá
  {"type": "hint_request", "level": 1}
  {"type": "get_status"}

Lưu ý: chat / speech-to-text giữa student & mentor được xử lý ở signaling WS
(/api/meetings/{meeting_id}/signal), không phải ở đây.

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
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, async_session_maker
from app.core.deps import get_current_user
from app.models.user import User
from app.models.mock_chat import MockChatMessage
from app.services.mock_qa_engine import MockQAEngine
from app.services.mock_qa_state import MockQASessionManager, SessionState
from app.services.mock_qa_rag import MockQARAGService
from app.services.rag_service import RAGService
from app.models.booking import MockBooking, BookingStatus
from app.models.meeting import Meeting

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mock-qa", tags=["Mock Q&A"])


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Schemas for Mock AI Room (Single Student vs AI Judge)
# ─────────────────────────────────────────────────────────────────────────────

class ChatMessageItem(BaseModel):
    role: str  # "user" | "assistant" | "mentor"
    content: str


class MockChatRequest(BaseModel):
    messages: List[ChatMessageItem] = Field(..., description="Lịch sử hội thoại giữa sinh viên và Giám khảo AI")
    context: Optional[str] = Field(None, description="Nội dung trích xuất từ tài liệu đồ án của sinh viên")


class MockChatResponse(BaseModel):
    reply: str


class MockHistoryMessage(BaseModel):
    role: str
    content: str
    time: Optional[str] = ""


class SaveHistoryRequest(BaseModel):
    messages: List[MockHistoryMessage]
    document_id: Optional[int] = None


class HistoryResponse(BaseModel):
    messages: List[MockHistoryMessage]
    document_id: Optional[int] = None


# ─────────────────────────────────────────────────────────────────────────────
# REST Endpoints for Mock Room AI
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/chat", response_model=MockChatResponse)
async def mock_ai_chat(
    req: MockChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Endpoint chat với Giám khảo AI trong phòng Mock Room AI.
    Giám khảo AI đóng vai trò phản biện, chất vấn đồ án sinh viên dựa trên ngữ cảnh tài liệu.
    """
    if not req.messages:
        raise HTTPException(status_code=400, detail="Danh sách tin nhắn không được để trống")

    system_prompt = (
        "Bạn là Giám khảo AI (Thành viên Hội đồng phản biện bảo vệ đồ án tốt nghiệp chuyên ngành CNTT / Phần mềm).\n"
        "Bạn đang trực tiếp chất vấn sinh viên trong buổi bảo vệ thử nghiệm (Mock Defense).\n\n"
        "NGUYÊN TẮC PHẢN BIỆN & CHẤT VẤN:\n"
        "1. Vai trò: Giữ phong thái chuyên nghiệp, nghiêm túc, thẳng thắn, sắc bén và mang tính học thuật cao như một giảng viên/chuyên gia phản biện thật.\n"
        "2. Đi sâu vào bản chất: Hỏi xoáy vào kiến trúc phần mềm, lựa chọn công nghệ, thiết kế CSDL, giải thuật, luồng xử lý ngoại lệ (edge cases), bảo mật, tính mở rộng và khả năng triển khai thực tế.\n"
        "3. Tận dụng tài liệu: Nếu có ngữ cảnh tài liệu đồ án đính kèm bên dưới, bạn phải bám sát nội dung đó để đặt câu hỏi cụ thể, chỉ ra điểm bất hợp lý, thiếu sót hoặc chưa thuyết phục.\n"
        "4. Phản hồi câu trả lời của sinh viên: Nhận xét ngắn gọn điểm tốt và điểm còn yếu/chưa chính xác trong câu trả lời của sinh viên, sau đó tiếp tục đặt câu hỏi chất vấn tiếp theo để thử thách sinh viên.\n"
        "5. Định dạng: Luôn trả lời bằng Tiếng Việt chuẩn mực, sử dụng Markdown (in đậm, danh sách bullet, khối code) để câu trả lời và câu hỏi rõ ràng, mạch lạc."
    )

    if req.context and req.context.strip():
        system_prompt += f"\n\n--- NGỮ CẢNH TÀI LIỆU ĐỒ ÁN CỦA SINH VIÊN ---\n{req.context.strip()[:15000]}\n--- HẾT NGỮ CẢNH ---"

    conversation_turns = []
    for msg in req.messages:
        role_label = "Sinh viên" if msg.role == "user" else "Giám khảo AI"
        conversation_turns.append(f"{role_label}: {msg.content}")

    full_prompt = "\n\n".join(conversation_turns)
    full_prompt += "\n\nGiám khảo AI:"

    try:
        from app.services.ai_client import ai_gateway
        res = await ai_gateway.generate(
            prompt=full_prompt,
            system_prompt=system_prompt,
            temperature=0.6,
            max_tokens=2048,
        )
        reply = res.get("content", "").strip()
        if not reply:
            reply = "Xin chào em. Tôi đã sẵn sàng, hãy bắt đầu buổi bảo vệ với phần trình bày hoặc câu trả lời của em."
        return MockChatResponse(reply=reply)
    except Exception as e:
        logger.exception("Mock AI chat failed")
        raise HTTPException(
            status_code=500,
            detail=f"Lỗi khi kết nối Giám khảo AI: {str(e)}"
        )


@router.get("/history", response_model=HistoryResponse)
async def get_mock_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lấy lịch sử chat phòng Mock AI của user hiện tại."""
    stmt = (
        select(MockChatMessage)
        .where(MockChatMessage.user_id == user.id)
        .order_by(MockChatMessage.id.asc())
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()

    if not rows:
        return HistoryResponse(messages=[], document_id=None)

    doc_id = None
    for r in reversed(rows):
        if r.document_id is not None:
            doc_id = r.document_id
            break

    msgs = [
        MockHistoryMessage(
            role=r.role,
            content=r.content,
            time=r.time_label or "",
        )
        for r in rows
    ]
    return HistoryResponse(messages=msgs, document_id=doc_id)


@router.put("/history")
async def save_mock_history(
    body: SaveHistoryRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lưu lịch sử chat phòng Mock AI của user hiện tại (thay thế lịch sử cũ)."""
    # Xoá lịch sử cũ
    await db.execute(
        sa_delete(MockChatMessage).where(MockChatMessage.user_id == user.id)
    )

    # Thêm lịch sử mới
    for m in body.messages:
        db.add(
            MockChatMessage(
                user_id=user.id,
                role=m.role,
                content=m.content,
                time_label=m.time or "",
                document_id=body.document_id,
            )
        )
    await db.commit()
    return {"success": True, "count": len(body.messages)}


@router.delete("/history")
async def clear_mock_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Xoá lịch sử chat phòng Mock AI của user hiện tại."""
    await db.execute(
        sa_delete(MockChatMessage).where(MockChatMessage.user_id == user.id)
    )
    await db.commit()
    return {"success": True}


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