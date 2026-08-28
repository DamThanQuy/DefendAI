"""
Router: Chat với ChatGPT-style messages (R7)

Endpoints:
- GET    /{ws_id}/messages          → danh sách messages (sliding window)
- POST   /{ws_id}/messages          → tạo message mới (user)
- POST   /{ws_id}/messages/stream   → streaming response (assistant)
- DELETE /{ws_id}/messages/{msg_id} → xoá message
- GET    /{ws_id}/conversations     → danh sách conversations
- POST   /{ws_id}/conversations     → tạo conversation mới
- PATCH  /{ws_id}/conversations/{id} → đổi tên conversation
- DELETE /{ws_id}/conversations/{id} → xoá conversation
"""
import asyncio
import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import AsyncIterator, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, text

from app.core.config import settings
from app.core.database import async_session_maker, get_db
from app.core.deps import get_current_user
from app.handlers.chat_messages import (
    load_messages,
    get_context_window,
    summarize_old_messages,
    load_history_for_rag,
    create_message,
    create_failed_message,
)
from app.handlers.workspace_questions import _ensure_indexed, _format_context
from app.models.entities import User, Workspace
from app.models.message import Message
from app.models.workspace_conversation import WorkspaceConversation
from app.services.ai_client import ai_gateway
from app.services.retriever import retrieve_mixed

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspaces", tags=["workspace-messages"])


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


async def _sse_frame(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


# ─────────────────────────────────────────────────────────────────────────────
# Messages
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/{workspace_id}/messages")
async def list_messages(
    workspace_id: int,
    conversation_id: Optional[str] = None,
    limit: int = 50,
    show_failed: bool = False,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """Load messages with sliding window context."""
    ws = await _get_owned_workspace(workspace_id, user, db)
    
    messages = await load_messages(
        db, ws.id, conversation_id, limit, show_failed
    )
    
    # Get context window
    context_msgs = await get_context_window(messages)
    
    return [m.to_dict() for m in context_msgs]


@router.post("/{workspace_id}/messages")
async def create_message_endpoint(
    workspace_id: int,
    body: dict,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """Create a new user message."""
    ws = await _get_owned_workspace(workspace_id, user, db)
    
    role = body.get("role", "user")
    content = body.get("content", "").strip()
    conversation_id = body.get("conversation_id")
    citations = body.get("citations")
    persona = body.get("persona", "theory")
    
    if not content:
        raise HTTPException(status_code=400, detail="Content is required")
    
    msg = await create_message(
        db, ws.id, role, content, conversation_id, citations, persona
    )
    
    return msg.to_dict()


@router.post("/{workspace_id}/messages/stream")
async def stream_message(
    workspace_id: int,
    body: dict,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """Stream assistant response to user message."""
    ws = await _get_owned_workspace(workspace_id, user, db)
    
    question = body.get("question", "").strip()
    conversation_id = body.get("conversation_id")
    persona = body.get("persona", "theory")
    
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")
    
    # Create user message
    user_msg = await create_message(
        db, ws.id, "user", question, conversation_id, persona=persona
    )
    
    return StreamingResponse(
        _chat_stream(ws.id, question, conversation_id, persona),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _chat_stream(
    workspace_id: int,
    question: str,
    conversation_id: Optional[str],
    persona: str,
) -> AsyncIterator[str]:
    """Stream RAG answer for a question."""
    # Create placeholder for assistant message
    async with async_session_maker() as db:
        msg = Message(
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            role="assistant",
            content="",
            status="processing",
            persona=persona,
        )
        db.add(msg)
        await db.commit()
        await db.refresh(msg)
        msg_id = msg.id
    
    yield await _sse_frame({"type": "meta", "message_id": msg_id})
    
    answer_parts = []
    citations = []
    
    try:
        # Index on demand
        await _ensure_indexed(workspace_id)
        
        # Retrieve chunks
        user_results, ref_results = await retrieve_mixed(question, workspace_id)
        
        if not user_results:
            raise ValueError("Workspace chưa có nội dung nào được index.")
        
        # Load history
        async with async_session_maker() as db:
            history = await load_history_for_rag(db, workspace_id, conversation_id)
        
        contexts = [_format_context(r) for r in user_results + ref_results]
        
        # Build citations
        from app.handlers.chat_ask import _MAX_CITATIONS
        for r in (user_results + ref_results)[:_MAX_CITATIONS]:
            title = str(r.get("title") or r.get("filename") or "unknown")
            idx = r.get("chunk_index")
            citations.append(f"{title}: đoạn {idx}" if idx is not None else title)
        
        # Build prompt
        from app.handlers.chat_ask import (
            _build_rag_answer_prompt,
            _build_chat_system_prompt,
        )
        prompt = _build_rag_answer_prompt(question, history, contexts, json_mode=False)
        
        yield await _sse_frame({"type": "status", "stage": "thinking"})
        
        # Stream response
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
            raise ValueError("AI không trả về được nội dung.")
        
        # Save completed message
        async with async_session_maker() as db:
            msg = await db.get(Message, msg_id)
            if msg:
                msg.content = answer
                msg.citations = json.dumps(citations)
                msg.tokens = msg.estimate_tokens()
                msg.status = "completed"
                await db.commit()
        
        yield await _sse_frame({
            "type": "done",
            "message_id": msg_id,
            "answer": answer,
            "citations": citations,
        })
    
    except Exception as exc:
        logger.exception("Chat stream failed")
        
        # Save failed message
        async with async_session_maker() as db:
            await create_failed_message(
                db, workspace_id, "assistant", 
                "".join(answer_parts), str(exc)[:500], conversation_id
            )
        
        yield await _sse_frame({
            "type": "error",
            "message": str(exc)[:500],
        })


# ─────────────────────────────────────────────────────────────────────────────
# Conversations
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/{workspace_id}/conversations")
async def list_conversations(
    workspace_id: int,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """List conversations for a workspace."""
    ws = await _get_owned_workspace(workspace_id, user, db)
    
    # Count messages per conversation
    rows = await db.execute(
        select(Message.conversation_id, func.count(Message.id), func.max(Message.created_at))
        .where(Message.workspace_id == ws.id)
        .group_by(Message.conversation_id)
        .order_by(func.max(Message.created_at).desc())
    )
    
    # Get custom names
    conv_rows = await db.execute(
        select(WorkspaceConversation.conversation_id, WorkspaceConversation.name)
        .where(WorkspaceConversation.workspace_id == ws.id)
    )
    names = {cid: name for cid, name in conv_rows.all()}
    
    items = []
    for conv_id, count, last_at in rows.all():
        items.append({
            "conversation_id": conv_id or "",
            "name": names.get(conv_id, f"Đoạn {conv_id[:8] if conv_id else 'mặc định'}"),
            "message_count": count,
            "last_message_at": last_at.isoformat() if last_at else None,
        })
    
    return items


@router.post("/{workspace_id}/conversations", status_code=201)
async def create_conversation(
    workspace_id: int,
    body: dict,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """Create a new conversation."""
    ws = await _get_owned_workspace(workspace_id, user, db)
    
    conv_id = uuid.uuid4().hex[:16]
    name = body.get("name", "Đoạn mới")
    
    conv = WorkspaceConversation(
        workspace_id=ws.id,
        conversation_id=conv_id,
        name=name,
    )
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    
    return {
        "conversation_id": conv.conversation_id,
        "name": conv.name,
        "workspace_id": ws.id,
    }


@router.patch("/{workspace_id}/conversations/{conversation_id}")
async def rename_conversation(
    workspace_id: int,
    conversation_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """Rename a conversation."""
    ws = await _get_owned_workspace(workspace_id, user, db)
    
    result = await db.execute(
        select(WorkspaceConversation).where(
            WorkspaceConversation.workspace_id == ws.id,
            WorkspaceConversation.conversation_id == conversation_id,
        )
    )
    conv = result.scalar_one_or_none()
    
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    conv.name = body.get("name", conv.name)
    await db.commit()
    await db.refresh(conv)
    
    return {"conversation_id": conv.conversation_id, "name": conv.name}


@router.delete("/{workspace_id}/conversations/{conversation_id}", status_code=204)
async def delete_conversation(
    workspace_id: int,
    conversation_id: str,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """Delete a conversation and all its messages."""
    ws = await _get_owned_workspace(workspace_id, user, db)
    
    # Delete messages
    await db.execute(
        text("DELETE FROM messages WHERE workspace_id = :ws_id AND conversation_id = :conv_id")
        .bindparams(ws_id=ws.id, conv_id=conversation_id)
    )
    
    # Delete conversation record
    result = await db.execute(
        select(WorkspaceConversation).where(
            WorkspaceConversation.workspace_id == ws.id,
            WorkspaceConversation.conversation_id == conversation_id,
        )
    )
    conv = result.scalar_one_or_none()
    if conv:
        await db.delete(conv)
    
    await db.commit()
    return None


@router.delete("/{workspace_id}/messages/failed")
async def delete_failed_messages(
    workspace_id: int,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """Delete failed/processing messages older than 5 minutes."""
    ws = await _get_owned_workspace(workspace_id, user, db)
    
    stale_cutoff = datetime.utcnow() - timedelta(minutes=5)
    
    result = await db.execute(
        text("""
            DELETE FROM messages 
            WHERE workspace_id = :ws_id 
            AND status IN ('failed', 'processing') 
            AND created_at < :cutoff
        """).bindparams(ws_id=ws.id, cutoff=stale_cutoff)
    )
    
    return {"deleted": result.rowcount}


@router.delete("/{workspace_id}/messages/{message_id}")
async def delete_message(
    workspace_id: int,
    message_id: int,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """Delete a specific message."""
    ws = await _get_owned_workspace(workspace_id, user, db)
    
    result = await db.execute(
        select(Message).where(Message.id == message_id, Message.workspace_id == ws.id)
    )
    msg = result.scalar_one_or_none()
    
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    
    await db.delete(msg)
    await db.commit()
    
    return {"deleted": True}
