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
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel
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


# ============================================================================
# Mentor AI — chat tự do (KHÔNG rubric / CLO / form cố định)
# ============================================================================
#
# Yêu cầu: mentor AI ở phòng Mock Room AI phải trả lời mọi câu hỏi của sinh
# viên như một trợ lý AI thông thường (ChatGPT / Gemini ...), không bị ràng
# buộc bởi tiêu chí chấm điểm hay khung câu hỏi cố định.
#
# Endpoint: POST /api/mock-qa/chat
#   body: { "messages": [{role: "user"|"assistant", content: str}, ...],
#           "context": str (tuỳ chọn — nội dung tài liệu đồ án) }
#   resp: { "reply": str, "provider": str, "model": str }
#
# History do client giữ (frontend đã có mảng `messages`), server chỉ nối
# system prompt + context tài liệu rồi gọi thẳng AI gateway.

_CHAT_MAX_MESSAGES = 20          # số lượt gần nhất gửi lên model
_CHAT_MAX_CONTEXT_CHARS = 8000   # giới hạn nội dung tài liệu nhét vào prompt
_CHAT_MAX_HISTORY_CHARS = 12000  # giới hạn tổng độ dài history text


class ChatMessage(BaseModel):
    role: str
    content: str


class MockChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: str = ""


class MockChatResponse(BaseModel):
    reply: str
    provider: Optional[str] = None
    model: Optional[str] = None


MENTOR_CHAT_SYSTEM_PROMPT = """Bạn là một GIÁM KHẢO trong hội đồng bảo vệ đồ án, đang trao đổi trực tiếp
với sinh viên trong phòng bảo vệ ảo. Bạn vừa là giám khảo am hiểu, vừa là một người
trò chuyện tự nhiên — KHÔNG phải một cỗ máy đặt câu hỏi.

NGUYÊN TẮC QUAN TRỌNG NHẤT — LẮNG NGHE VÀ PHẢN HỒI ĐÚNG NHỮNG GÌ SINH VIÊN VỪA NÓI:
- Trước khi nói gì, hãy ĐỌC KỸ lượt mới nhất của sinh viên và đánh giá nội dung đó:
  ý nào đúng, ý nào sai/thiếu, lập luận có thuyết phục không, có mâu thuẫn với những
  gì em đã nói trước đó không.
- Câu trả lời của bạn phải BẮT ĐẦU từ nội dung sinh viên vừa trình bày — nhận xét,
  bổ sung, sửa lỗi, hoặc đồng tình — chứ không phải phớt lờ và hỏi một câu mới lạc đề.
- Giữ mạch hội thoại: nhớ và tham chiếu những gì đã trao đổi trong lịch sử chat
  ("như em vừa nói về X...", "lúc nãy em đề cập Y..."). KHÔNG nhảy sang chủ đề
  khác hẳn khi chủ đề trước còn đang dở.
- Khi sinh viên đặt câu hỏi cho bạn hoặc nhờ giải thích, hãy TRẢ LỜI THẬT sự hữu ích
  như ChatGPT/Gemini — giải thích cặn kẽ, có ví dụ — rồi mới dẫn tiếp. Đừng chỉ hỏi lại.

KHI NÀO THÌ ĐẶT CÂU HỎI:
- Đặt câu hỏi chỉ khi nó LÀM TIẾP từ câu trả lời vừa rồi của sinh viên (đào sâu hơn,
  kiểm chứng, nêu tình huống liên quan), hoặc khi buổi trao đổi cần được khởi động.
- KHÔNG nhất thiết mỗi lượt phải kết bằng một câu hỏi. Nếu sinh viên vừa hỏi bạn
  điều gì, hoặc câu chuyện đã đủ ý, cứ trả lời/tóm tắt/chốt ý mà không hỏi lại.
- Thi thoảng (không phải mọi lượt) có thể chốt lại một vài ý chính đã trao đổi cho
  sinh viên dễ theo dõi.

CHẤT LƯỢNG NỘI DUNG:
- Bám vào đồ án thực của sinh viên (NGỮ CẢNH TÀI LIỆU + những gì em đã trình bày
  trong chat) — cụ thể, không chung chung.
- Nghiêm khắc nhưng công bằng: câu trả lời tốt thì ghi nhận và nói rõ vì sao tốt;
  câu trả lời còn lỗ hổng thì chỉ đích danh lỗ hổng, giải thích ngắn gọn, rồi mới
  gợi ý hướng đào sâu.
- KHÔNG chấm điểm số, KHÔNG gán nhãn CLO, KHÔNG trả về JSON hay văn bản theo template.

ĐỊNH DẠNG TRẢ LỜI:
- Văn nói tự nhiên, thân thiện nhưng đúng chất giám khảo; tiếng Việt (theo ngôn ngữ
  sinh viên đang dùng).
- Dùng markdown khi cần (đoạn code, danh sách) để dễ đọc.
- Độ dài vừa phải, đi thẳng vào vấn đề; tránh lan man, tránh khuôn mẫu lặp lại
  ở mọi lượt."""


def _build_mentor_prompt(messages: List[ChatMessage], context: str) -> str:
    """Gộp lịch sử hội thoại + context tài liệu thành 1 user prompt duy nhất.

    AI gateway hiện chỉ nhận (system_prompt, prompt) — không có mảng messages —
    nên lịch sử được render dạng text vào prompt.
    """
    recent = [m for m in messages if (m.content or "").strip()][-_CHAT_MAX_MESSAGES:]

    lines: List[str] = []
    ctx = (context or "").strip()
    if ctx:
        if len(ctx) > _CHAT_MAX_CONTEXT_CHARS:
            ctx = ctx[:_CHAT_MAX_CONTEXT_CHARS] + "\n... (tài liệu dài, đã cắt bớt)"
        lines.append("NGỮ CẢNH TÀI LIỆU ĐỒ ÁN CỦA SINH VIÊN:\n" + ctx)
        lines.append("")

    lines.append("LỊCH SỬ TRÒ CHUYỆN:")
    for m in recent[:-1]:
        who = "Sinh viên" if m.role == "user" else "Bạn (mentor AI)"
        lines.append(f"{who}: {m.content.strip()}")
    lines.append("")
    lines.append("LƯỢT HIỆN TẠI CỦA SINH VIÊN:")
    lines.append(recent[-1].content.strip() if recent else "(trống)")
    lines.append("")
    lines.append(
        "Hãy hồi đáp lượt hiện tại của sinh viên: trước tiên đọc và đánh giá nội dung "
        "em vừa nói (đúng/sai/thiếu gì, liên kết với các lượt trước), trả lời các câu hỏi "
        "em đặt ra nếu có, rồi mới dẫn dắt tiếp một cách tự nhiên. "
        "KHÔNG trả về JSON, KHÔNG theo template hay tiêu chí cố định nào."
    )

    prompt = "\n".join(lines)
    if len(prompt) > _CHAT_MAX_HISTORY_CHARS + _CHAT_MAX_CONTEXT_CHARS + 2000:
        prompt = prompt[: _CHAT_MAX_HISTORY_CHARS + _CHAT_MAX_CONTEXT_CHARS + 2000]
    return prompt


@router.post(
    "/chat",
    response_model=MockChatResponse,
    summary="Mentor AI chat tự do (không rubric / form cố định)",
)
async def mentor_chat(
    payload: MockChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trả lời mọi câu hỏi của sinh viên như trợ lý AI thông thường.

    Không sinh câu hỏi theo CLO, không chấm tiêu chí, không trả JSON cấu trúc —
    chỉ trả về text markdown tự do.
    """
    if not payload.messages or not any((m.content or "").strip() for m in payload.messages):
        raise HTTPException(status_code=400, detail="messages rỗng")

    from app.services.ai_client import ai_gateway
    from app.services.feature_ai import resolve_feature_ai

    provider, model = await resolve_feature_ai(db, "mock_qa")
    prompt = _build_mentor_prompt(payload.messages, payload.context)

    try:
        result = await ai_gateway.generate(
            prompt=prompt,
            system_prompt=MENTOR_CHAT_SYSTEM_PROMPT,
            provider=provider,
            model=model,
            temperature=0.7,
            max_tokens=1600,
        )
    except RuntimeError as e:
        # Provider chưa cấu hình / không khả dụng
        logger.warning("mentor_chat: provider unavailable: %s", e)
        raise HTTPException(
            status_code=503,
            detail="Chưa cấu hình model AI cho Mentor chat. Vào trang Admin → AI để bật provider.",
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("mentor_chat: AI call failed")
        raise HTTPException(status_code=502, detail=f"Gọi AI thất bại: {type(e).__name__}: {e}")

    reply = (result.get("content") or "").strip()
    if not reply:
        raise HTTPException(status_code=502, detail="AI trả về nội dung rỗng")

    return MockChatResponse(
        reply=reply,
        provider=result.get("provider"),
        model=result.get("model"),
    )


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