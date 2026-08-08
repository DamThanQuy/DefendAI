"""Handler cho job 'chat_ask' (R7): hỏi-đáp RAG đa-turn theo workspace.

Luồng: load row → index-on-demand (reuse R6) → retrieve top-K (R5) →
prompt đa-turn (6 turn completed gần nhất cùng workspace) kèm citations →
AI trả lời JSON → lưu. Reuse mọi helper có sẵn; không build lại hạ tầng RAG.
"""
from __future__ import annotations

import logging
from typing import List, Optional

from sqlalchemy import String, select

from app.core.config import settings
from app.core.database import async_session_maker
from app.handlers.questions import (
    MAX_PROMPT_CHARS,
    PERSONA_DESCRIPTIONS,
    _build_system_prompt,
    _extract_json_payload,
    _normalize_persona,
    _truncate_text,
)
from app.handlers.workspace_questions import _ensure_indexed, _format_context
from app.models.entities import AssessmentStatus, WorkspaceChat
from app.services.ai_client import ai_gateway
from app.services.job_queue import register_handler, update_job
from app.services.retriever import retrieve_mixed

logger = logging.getLogger(__name__)

_HISTORY_TURNS = 6
_MAX_CITATIONS = 4


async def _load_history(db, workspace_id: int, conversation_id: Optional[str] = None) -> List[dict]:
    """6 turn completed gần nhất (question + answer), cũ → mới, làm ngữ cảnh đa-turn.

    Lọc theo conversation_id (NULL = đoạn mặc định) để mỗi đoạn chat giữ ngữ cảnh riêng.
    """
    stmt = select(WorkspaceChat).where(
        WorkspaceChat.workspace_id == workspace_id,
        # status là cột varchar trong DB (xem migration 0004); cast String để
        # so sánh không sinh param ::assessmentstatus trên cột varchar
        WorkspaceChat.status.cast(String) == "completed",
    )
    if conversation_id is not None:
        stmt = stmt.where(WorkspaceChat.conversation_id == (conversation_id or None))
    else:
        stmt = stmt.where(WorkspaceChat.conversation_id.is_(None))
    result = await db.execute(
        stmt.order_by(WorkspaceChat.created_at.desc()).limit(_HISTORY_TURNS)
    )
    turns = list(reversed(result.scalars().all()))
    return [{"question": t.question, "answer": t.answer or ""} for t in turns]


def _format_history(history: List[dict]) -> str:
    if not history:
        return "(không có lịch sử)"
    lines = []
    for i, turn in enumerate(history, start=1):
        lines.append(f"{i}. Người hỏi: {turn['question']}")
        lines.append(f"   AI trả lời: {turn['answer']}")
    return "\n".join(lines)


def _build_rag_answer_prompt(question: str, persona: str, history: List[dict], contexts: List[str], json_mode: bool = True) -> str:
    body = "\n\n".join(f"{i}. {c}" for i, c in enumerate(contexts, start=1))
    if json_mode:
        format_instr = (
            "Trả về đúng một object JSON: "
            '{"answer": "...", "citations": ["Nhom5_.pdf: đoạn 1", ...]}. '
            "citations là mảng nguồn [\"file: đoạn X\", ...] mà câu trả lời dựa vào "
            "(chỉ dùng ĐÚNG tên nguồn đã liệt kê ở các đoạn trên, tối đa 4 nguồn). "
        )
    else:
        format_instr = (
            "Trả lời thuần văn bản markdown, KHÔNG gói trong JSON, không tự thêm "
            "mục citations hay nguồn — hệ thống tự gắn nguồn file:đoạn cho câu trả lời. "
        )
    return _truncate_text(
        f"Câu hỏi cần trả lời: {question}\n"
        f"Persona: {persona}\n\n"
        "Lịch sử hội thoại trước đó (giữ ngữ cảnh cho câu trả lời):\n"
        f"{_format_history(history)}\n\n"
        "Dưới đây là các đoạn trích liên quan nhất. Nhãn [USER: ...] là nội dung đồ án, "
        "nhãn [REF: ...] là tiêu chuẩn/rubric của hội đồng (mỗi đoạn đầu có nguồn).\n\n"
        f"{body}\n\n"
        "Hãy trả lời câu hỏi thật chi tiết, bám sát câu hỏi và các đoạn trích trên. "
        f"{format_instr}"
        "TUYỆT ĐỐI không bịa đặt nội dung không có trong các đoạn trích.",
        MAX_PROMPT_CHARS,
    )


def _build_chat_system_prompt(persona: str) -> str:
    """System prompt cho chat (khác hẳn bản tạo câu hỏi): trả lời thuần text, không ép JSON."""
    description = PERSONA_DESCRIPTIONS.get(persona, PERSONA_DESCRIPTIONS["theory"])
    return (
        "Bạn là trợ lý học thuật trả lời câu hỏi của sinh viên về đồ án của họ. "
        "Đọc kỹ các đoạn trích từ đồ án được cung cấp và trả lời chi tiết, bám sát nội dung đó.\n\n"
        f"Persona: {persona}\n"
        f"Mô tả persona: {description}\n\n"
        "⚠️ ANTI-HALLUCINATION: TUYỆT ĐỐI KHÔNG bịa đặt, suy diễn, hay thêm thông tin "
        "không có trong các đoạn trích. Nếu thông tin không có trong đồ án, hãy nói rõ điều đó.\n\n"
        "Trả lời thuần văn bản markdown. KHÔNG gói trong JSON, không tự thêm mục citations."
    )


def _normalize_answer(ai_content: str) -> dict:
    """Answer sạch + citations lọc hợp lệ; AI không trả JSON → giữ nguyên text."""
    payload = _extract_json_payload(ai_content)
    answer = payload.get("answer")
    if isinstance(answer, str) and answer.strip():
        citations = payload.get("citations", [])
        if not isinstance(citations, list):
            citations = []
        citations = [c for c in citations if isinstance(c, str) and ":" in c][:_MAX_CITATIONS]
        return {"answer": answer.strip(), "citations": citations}
    return {"answer": ai_content.strip(), "citations": []}


@register_handler("chat_ask")
async def handle_chat_ask(params: dict) -> dict:
    chat_id: int = params["chat_id"]
    workspace_id: int = params["workspace_id"]
    question: str = params["question"]
    persona = _normalize_persona(params.get("persona", "theory"))
    conversation_id: Optional[str] = params.get("conversation_id")
    job_id = params.get("_job_id")

    async with async_session_maker() as db:
        result = await db.execute(select(WorkspaceChat).where(WorkspaceChat.id == chat_id))
        row = result.scalar_one_or_none()
        if not row:
            raise ValueError(f"WorkspaceChat {chat_id} not found")
        row.status = AssessmentStatus.processing
        await db.commit()

    if job_id:
        await update_job(job_id, progress="10")

    try:
        await _ensure_indexed(workspace_id)
        if job_id:
            await update_job(job_id, progress="50")

        # R10: 2 query song song — user chunks + reference chunks (cùng 1 embed)
        user_results, ref_results = await retrieve_mixed(question, workspace_id)

        # min_score (R5) quá cao / câu hỏi xa → fallback lấy toàn bộ user chunks đạt ngưỡng 0
        saved_min = settings.rag.min_score
        settings.rag.min_score = 0.0
        try:
            if not user_results:
                user_results, ref_results = await retrieve_mixed(question, workspace_id)
        finally:
            settings.rag.min_score = saved_min

        if not user_results:
            async with async_session_maker() as db:
                row = await db.get(WorkspaceChat, chat_id)
                row.status = AssessmentStatus.failed
                row.error = "Workspace chưa có nội dung nào được index để trả lời."
                await db.commit()
            return {"chat_id": chat_id, "status": "failed", "answer": "", "error": row.error}

        # Reference rỗng thì bỏ qua (chỉ dùng user chunks) — không chặn job
        async with async_session_maker() as db:
            history = await _load_history(db, workspace_id, conversation_id)
        contexts = [_format_context(r) for r in user_results + ref_results]
        prompt = _build_rag_answer_prompt(question, persona, history, contexts)
        ai_result = await ai_gateway.generate(
            prompt=prompt,
            system_prompt=_build_system_prompt(persona),
            temperature=0.3,
            max_tokens=4000,
        )
        norm = _normalize_answer(ai_result["content"])

        if not norm["answer"]:
            async with async_session_maker() as db:
                row = await db.get(WorkspaceChat, chat_id)
                row.status = AssessmentStatus.failed
                row.error = "AI không trả về được nội dung trả lời."
                await db.commit()
            return {"chat_id": chat_id, "status": "failed", "answer": "", "error": row.error}

        async with async_session_maker() as db:
            row = await db.get(WorkspaceChat, chat_id)
            row.answer = norm["answer"]
            row.citations = norm["citations"]
            row.status = AssessmentStatus.completed
            await db.commit()

        if job_id:
            await update_job(job_id, progress="90")

        return {
            "chat_id": chat_id,
            "workspace_id": workspace_id,
            "status": "completed",
            "answer": norm["answer"],
            "citations": norm["citations"],
            "provider": ai_result.get("provider", "default"),
            "model": ai_result.get("model", "default"),
        }
    except Exception as exc:
        logger.exception("Chat job failed")
        async with async_session_maker() as db:
            row = await db.get(WorkspaceChat, chat_id)
            if row:
                row.status = AssessmentStatus.failed
                row.error = str(exc)[:500]
                await db.commit()
        raise
