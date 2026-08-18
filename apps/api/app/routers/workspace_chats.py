"""Router: Chat đề tài (R7) — workspace-scoped RAG chat (multi-turn).

Endpoints:
- POST /api/workspaces/{ws_id}/chat → tạo lượt chat (202 + job_id) — legacy (worker)
- GET  /api/workspaces/{ws_id}/chat → lịch sử hội thoại (mới → cũ)
- POST /api/workspaces/{ws_id}/chat/stream → SSE streaming trả lời (R7 UX)

Có auth: chỉ chủ sở hữu workspace mới gọi được.
"""
import asyncio
import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import AsyncIterator, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from app.core.config import settings
from app.core.database import async_session_maker, get_db
from app.core.deps import get_current_user
from app.handlers.chat_ask import (
    _load_history,
    _build_rag_answer_prompt,
    _build_chat_system_prompt,
    _MAX_CITATIONS,
)
from app.handlers.workspace_questions import _ensure_indexed, _format_context
from app.models.entities import AssessmentStatus, User, Workspace, WorkspaceChat
from app.models.workspace_conversation import WorkspaceConversation
from app.schemas.workspace_chat import (
    WorkspaceChatCreateRequest,
    WorkspaceChatCreateResponse,
    WorkspaceChatResponse,
    ConversationCreateRequest,
    ConversationRenameRequest,
    ConversationItem,
)
from app.services.ai_client import ai_gateway
from app.services.job_queue import create_job
from app.services.retriever import retrieve_mixed

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspaces", tags=["workspace-chat"])


async def _get_owned_workspace(workspace_id: int, user: User, db) -> Workspace:
    result = await db.execute(
        select(Workspace).where(
            Workspace.id == workspace_id, Workspace.user_id == user.id
        )
    )
    ws = result.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


@router.post("/{workspace_id}/chat", response_model=WorkspaceChatCreateResponse, status_code=202)
async def create_workspace_chat(
    workspace_id: int,
    body: WorkspaceChatCreateRequest,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    ws = await _get_owned_workspace(workspace_id, user, db)

    row = WorkspaceChat(
        workspace_id=ws.id,
        conversation_id=body.conversation_id,
        question=body.question.strip(),
        status=AssessmentStatus.pending,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    job_id = await create_job(
        "chat_ask",
        {
            "chat_id": row.id,
            "workspace_id": ws.id,
            "question": row.question,
            "conversation_id": row.conversation_id,
        },
    )
    return WorkspaceChatCreateResponse(chat_id=row.id, job_id=job_id, status="queued")


async def _sse_frame(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _chat_sse(workspace_id: int, question: str, conversation_id: Optional[str] = None) -> AsyncIterator[str]:
    """Streaming RAG answer qua SSE. Tạo row processing → stream delta → lưu completed/failed."""
    # Tạo row ngay trong generator (client đã kết nối → không để row mồ côi processing)
    async with async_session_maker() as db:
        row = WorkspaceChat(
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            question=question,
            status=AssessmentStatus.processing,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        chat_id = row.id
    yield await _sse_frame({"type": "meta", "chat_id": chat_id})

    answer_parts: list[str] = []
    citations: list[str] = []
    try:
        await _ensure_indexed(workspace_id)

        # 2 query song song (user + reference chunks), fallback min_score 0 như handler chat_ask
        user_results, ref_results = await retrieve_mixed(question, workspace_id)
        saved_min = settings.rag.min_score
        settings.rag.min_score = 0.0
        try:
            if not user_results:
                user_results, ref_results = await retrieve_mixed(question, workspace_id)
        finally:
            settings.rag.min_score = saved_min

        if not user_results:
            raise ValueError("Workspace chưa có nội dung nào được index để trả lời.")

        async with async_session_maker() as db:
            history = await _load_history(db, workspace_id, conversation_id)
        contexts = [_format_context(r) for r in user_results + ref_results]

        # Citations deterministic từ kết quả retrieve (top N), không để AI tự bịa
        for r in (user_results + ref_results)[:_MAX_CITATIONS]:
            title = str(r.get("title") or r.get("filename") or "unknown")
            idx = r.get("chunk_index")
            citations.append(f"{title}: đoạn {idx}" if idx is not None else title)

        prompt = _build_rag_answer_prompt(question, history, contexts, json_mode=False)
        yield await _sse_frame({"type": "status", "stage": "thinking"})

        async for chunk in ai_gateway.generate_stream(
            prompt=prompt,
            system_prompt=_build_chat_system_prompt(),
            temperature=0.3,
            max_tokens=4000,
        ):
            if chunk.get("content"):
                answer_parts.append(chunk["content"])
                yield await _sse_frame({"type": "delta", "text": chunk["content"]})

        answer = "".join(answer_parts).strip()
        if not answer:
            raise ValueError("AI không trả về được nội dung trả lời.")

        async with async_session_maker() as db:
            row = await db.get(WorkspaceChat, chat_id)
            if row:
                row.answer = answer
                row.citations = citations
                row.status = AssessmentStatus.completed
                await db.commit()
        yield await _sse_frame({"type": "done", "answer": answer, "citations": citations})

    except (asyncio.CancelledError, GeneratorExit):
        # Client ngắt kết nối giữa chừng (F5/đóng tab) → Starlette đóng generator,
        # GeneratorExit/CancelledError là BaseException (không lọt vào except Exception
        # ở trên) → trước đây row kẹt "processing" vĩnh viễn, reload vẫn thấy
        # "AI đang suy nghĩ...". Đánh dấu failed rồi re-raise để giữ ngữ nghĩa hủy.
        partial = "".join(answer_parts).strip()
        async with async_session_maker() as db:
            row = await db.get(WorkspaceChat, chat_id)
            if row and row.status == AssessmentStatus.processing:
                if partial:
                    row.answer = partial
                row.status = AssessmentStatus.failed
                row.error = "Kết nối bị ngắt khi đang trả lời."
                await db.commit()
        raise

    except Exception as exc:
        logger.exception("Chat stream failed")
        partial = "".join(answer_parts).strip()
        async with async_session_maker() as db:
            row = await db.get(WorkspaceChat, chat_id)
            if row:
                if partial:
                    row.answer = partial
                row.status = AssessmentStatus.failed
                row.error = str(exc)[:500]
                await db.commit()
        yield await _sse_frame({"type": "error", "message": str(exc)[:500], "answer": partial})


@router.post("/{workspace_id}/chat/stream")
async def stream_workspace_chat(
    workspace_id: int,
    body: WorkspaceChatCreateRequest,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    ws = await _get_owned_workspace(workspace_id, user, db)
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required")
    return StreamingResponse(
        _chat_sse(ws.id, question, body.conversation_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{workspace_id}/chat/conversations", response_model=list[ConversationItem])
async def list_conversations(
    workspace_id: int,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """Danh sách đoạn chat (conversation) của workspace. NULL = đoạn mặc định (trả name='Đoạn mặc định')."""
    ws = await _get_owned_workspace(workspace_id, user, db)
    rows = (
        await db.execute(
            select(WorkspaceChat.conversation_id, func.count(WorkspaceChat.id), func.max(WorkspaceChat.created_at))
            .where(WorkspaceChat.workspace_id == ws.id)
            .group_by(WorkspaceChat.conversation_id)
            .order_by(func.max(WorkspaceChat.created_at).desc())
        )
    ).all()
    # Tên tuỳ chỉnh (nếu user đã đổi) — lấy 1 query thay vì N+1
    conv_rows = (
        await db.execute(
            select(WorkspaceConversation.conversation_id, WorkspaceConversation.name).where(
                WorkspaceConversation.workspace_id == ws.id
            )
        )
    ).all()
    names = {cid: name for cid, name in conv_rows}
    items = []
    for conv_id, count, last_at in rows:
        if not conv_id:
            continue  # Đoạn mặc định (NULL) luôn hiển thị bằng nút cố định — không đưa vào list
        items.append(
            ConversationItem(
                conversation_id=conv_id,
                name=names.get(conv_id, f"Đoạn {conv_id[:8]}"),
                turn_count=count,
                last_message_at=last_at,
            )
        )
    return items


@router.post("/{workspace_id}/chat/conversations", status_code=201)
async def create_conversation(
    workspace_id: int,
    body: ConversationCreateRequest,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """Tạo đoạn chat mới → trả conversation_id (UUID)."""
    ws = await _get_owned_workspace(workspace_id, user, db)
    conv_id = uuid.uuid4().hex[:16]
    return {"conversation_id": conv_id, "name": body.name, "workspace_id": ws.id}


@router.patch("/{workspace_id}/chat/conversations/{conversation_id}", status_code=200)
async def rename_conversation(
    workspace_id: int,
    conversation_id: str,
    body: ConversationRenameRequest,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """Đổi tên đoạn chat — upsert vào bảng workspace_conversations."""
    ws = await _get_owned_workspace(workspace_id, user, db)
    result = await db.execute(
        select(WorkspaceConversation).where(
            WorkspaceConversation.workspace_id == ws.id,
            WorkspaceConversation.conversation_id == conversation_id,
        )
    )
    conv = result.scalar_one_or_none()
    if conv:
        conv.name = body.name
    else:
        conv = WorkspaceConversation(
            workspace_id=ws.id, conversation_id=conversation_id, name=body.name
        )
        db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return {"conversation_id": conv.conversation_id, "name": conv.name}


@router.delete("/{workspace_id}/chat/conversations/{conversation_id}", status_code=204)
async def delete_conversation(
    workspace_id: int,
    conversation_id: str,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """Xoá đoạn chat (xoá toàn bộ lượt của nó)."""
    ws = await _get_owned_workspace(workspace_id, user, db)
    result = await db.execute(
        select(WorkspaceChat).where(
            WorkspaceChat.workspace_id == ws.id,
            WorkspaceChat.conversation_id == conversation_id,
        )
    )
    rows = result.scalars().all()
    for r in rows:
        await db.delete(r)
    await db.commit()
    return None


@router.get("/{workspace_id}/chat", response_model=list[WorkspaceChatResponse])
async def list_workspace_chats(
    workspace_id: int,
    conversation_id: Optional[str] = None,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    ws = await _get_owned_workspace(workspace_id, user, db)
    stmt = select(WorkspaceChat).where(WorkspaceChat.workspace_id == ws.id)
    if conversation_id is not None:
        stmt = stmt.where(WorkspaceChat.conversation_id == (conversation_id or None))
    else:
        # Mặc định: chỉ đoạn mặc định (NULL) — không lẫn các đoạn khác
        stmt = stmt.where(WorkspaceChat.conversation_id.is_(None))
    stmt = stmt.order_by(WorkspaceChat.created_at.desc())
    result = await db.execute(stmt)
    rows = result.scalars().all()
    # Tự chữa row "processing" mồ côi (stream bị ngắt trước fix trên): quá 5 phút
    # mà chưa hoàn tất thì coi như failed — không để UI hiện suy nghĩ vĩnh viễn.
    stale_cutoff = datetime.utcnow() - timedelta(minutes=5)
    dirty = False
    for r in rows:
        if r.status == AssessmentStatus.processing and r.created_at < stale_cutoff:
            r.status = AssessmentStatus.failed
            r.error = r.error or "Luồng trả lời bị gián đoạn (quá thời gian chờ)."
            dirty = True
    if dirty:
        await db.commit()
    return rows
