"""
Handler: Chat với ChatGPT-style messages

Features:
- Sliding window context (last N messages within token limit)
- Auto-summary for old messages
- Token tracking per message
- Multi-conversation support
"""
from __future__ import annotations

import logging
from typing import List, Optional

from sqlalchemy import String, select
from sqlalchemy.orm import Session

from app.core.database import async_session_maker
from app.models.message import Message
from app.models.workspace_chat import WorkspaceChat
from app.handlers.chat_ask import (
    _load_history as _load_old_history,
    _build_rag_answer_prompt,
    _build_chat_system_prompt,
    _MAX_CITATIONS,
)
from app.services.ai_client import ai_gateway
from app.services.retriever import retrieve_mixed
from app.handlers.workspace_questions import _ensure_indexed, _format_context

logger = logging.getLogger(__name__)

# Context window settings
CONTEXT_WINDOW_TOKENS = 12000  # ~12k tokens context window
SUMMARY_THRESHOLD_TOKENS = 8000  # Start summarizing when exceeding this
MAX_MESSAGES_PER_CONVERSATION = 100  # Hard limit per conversation


async def load_messages(
    db: Session,
    workspace_id: int,
    conversation_id: Optional[str] = None,
    limit: int = 50,
    show_failed: bool = False,
) -> List[Message]:
    """Load messages for a conversation with sliding window."""
    stmt = select(Message).where(Message.workspace_id == workspace_id)
    
    if conversation_id is not None:
        stmt = stmt.where(Message.conversation_id == conversation_id)
    else:
        stmt = stmt.where((Message.conversation_id.is_(None)) | (Message.conversation_id == '') | (Message.conversation_id == 'default'))
    
    if not show_failed:
        from sqlalchemy import text
        stmt = stmt.where(text("status != 'failed'"))
    
    stmt = stmt.order_by(Message.created_at.desc()).limit(limit)
    result = await db.execute(stmt)
    messages = list(reversed(result.scalars().all()))  # Oldest first
    
    return messages


async def get_context_window(
    messages: List[Message],
    max_tokens: int = CONTEXT_WINDOW_TOKENS,
) -> List[Message]:
    """Get messages within context window ( newest first, respecting token limit)."""
    total_tokens = 0
    window = []
    
    # Iterate from newest to oldest
    for msg in reversed(messages):
        msg_tokens = msg.tokens or msg.estimate_tokens()
        total_tokens += msg_tokens
        
        if total_tokens > max_tokens:
            break
        
        window.append(msg)
    
    # Reverse to get oldest first (conversational order)
    return list(reversed(window))


async def summarize_old_messages(
    db: Session,
    messages: List[Message],
) -> Optional[str]:
    """Generate summary of old messages when context window is full."""
    # Get messages outside context window
    context_msgs = await get_context_window(messages, CONTEXT_WINDOW_TOKENS)
    old_msgs = [m for m in messages if m.id not in [m.id for m in context_msgs]]
    
    if not old_msgs:
        return None
    
    # Format old messages for summarization
    summary_text = "\n".join([
        f"{i+1}. {m.role}: {m.content[:500]}"
        for i, m in enumerate(old_msgs[:10])  # Summarize up to 10 old messages
    ])
    
    # Call AI to generate summary
    try:
        from app.services.ai_client import ai_gateway
        result = await ai_gateway.generate(
            prompt=f"Tóm tắt ngắn gọn cuộc trò chuyện sau (tối đa 200 chữ):\n{summary_text}",
            system_prompt="Bạn là trợ lý tóm tắt hội thoại. Trả về tóm tắt ngắn gọn, súc tích.",
            temperature=0.3,
            max_tokens=300,
        )
        return result.get("content", "").strip()
    except Exception as e:
        logger.warning(f"Failed to summarize messages: {e}")
        return None


async def load_history_for_rag(
    db: Session,
    workspace_id: int,
    conversation_id: Optional[str] = None,
) -> List[dict]:
    """Load conversation history for RAG prompt (6 turns near)."""
    # Load recent completed messages
    stmt = select(Message).where(
        Message.workspace_id == workspace_id,
        Message.status == "completed",
        Message.role.in_(["user", "assistant"]),
    )
    
    if conversation_id is not None:
        stmt = stmt.where(Message.conversation_id == conversation_id)
    else:
        stmt = stmt.where((Message.conversation_id.is_(None)) | (Message.conversation_id == '') | (Message.conversation_id == 'default'))
    
    result = await db.execute(
        stmt.order_by(Message.created_at.desc()).limit(12)  # 6 pairs = 12 messages
    )
    messages = list(reversed(result.scalars().all()))
    
    # Format as Q&A pairs
    history = []
    for i in range(0, len(messages), 2):
        if i + 1 < len(messages):
            user_msg = messages[i]
            assistant_msg = messages[i + 1]
            history.append({
                "question": user_msg.content,
                "answer": assistant_msg.content,
            })
    
    return history[:6]  # Max 6 turns


async def create_message(
    db: Session,
    workspace_id: int,
    role: str,
    content: str,
    conversation_id: Optional[str] = None,
    citations: Optional[List[str]] = None,
    persona: str = "theory",
) -> Message:
    """Create a new message."""
    msg = Message(
        workspace_id=workspace_id,
        conversation_id=conversation_id,
        role=role,
        content=content,
        citations=json.dumps(citations) if citations else None,
        persona=persona,
        tokens=len(content) // 4,  # Rough estimate
        status="completed",
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


async def create_failed_message(
    db: Session,
    workspace_id: int,
    role: str,
    content: str,
    error: str,
    conversation_id: Optional[str] = None,
) -> Message:
    """Create a failed message."""
    msg = Message(
        workspace_id=workspace_id,
        conversation_id=conversation_id,
        role=role,
        content=content,
        error=error[:500],
        status="failed",
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


# Legacy compatibility: wrap old workspace_chats loading
async def _load_history_legacy(
    db: Session,
    workspace_id: int,
    conversation_id: Optional[str] = None,
) -> List[dict]:
    """Load history from old workspace_chats table for migration."""
    stmt = select(WorkspaceChat).where(
        WorkspaceChat.workspace_id == workspace_id,
        WorkspaceChat.status.cast(String) == "completed",
    )
    if conversation_id is not None:
        stmt = stmt.where(WorkspaceChat.conversation_id == conversation_id)
    else:
        stmt = stmt.where((WorkspaceChat.conversation_id.is_(None)) | (WorkspaceChat.conversation_id == '') | (WorkspaceChat.conversation_id == 'default'))
    
    result = await db.execute(
        stmt.order_by(WorkspaceChat.created_at.desc()).limit(6)
    )
    turns = list(reversed(result.scalars().all()))
    return [{"question": t.question, "answer": t.answer or ""} for t in turns]
