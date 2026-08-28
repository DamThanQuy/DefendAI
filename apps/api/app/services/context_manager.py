"""
Context Manager - Quản lý context window giống ChatGPT

Features:
- Sliding window: Chỉ giữ N tin nhắn gần nhất trong context
- Token tracking: Đếm tokens per-message
- Auto-summary: Tự động tóm tắt tin nhắn cũ khi vượt ngưỡng
- Conversation isolation: Mỗi conversation có context riêng
"""
from __future__ import annotations

import logging
from typing import List, Optional
from datetime import datetime

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.models.message import Message
from app.services.ai_client import ai_gateway

logger = logging.getLogger(__name__)

# Context window settings
DEFAULT_CONTEXT_WINDOW = 12000  # 12k tokens (tương đương ~30-50 tin nhắn)
MAX_CONTEXT_WINDOW = 200000     # 200k tokens (hard limit)
SUMMARY_THRESHOLD = 8000        # Bắt đầu summarize khi vượt quá ngưỡng này


class ContextManager:
    """Quản lý context window cho từng conversation."""
    
    def __init__(self, workspace_id: int, conversation_id: Optional[str] = None):
        self.workspace_id = workspace_id
        self.conversation_id = conversation_id
    
    async def load_messages(self, db: Session, limit: int = 100) -> List[Message]:
        """Load messages với sliding window."""
        stmt = select(Message).where(Message.workspace_id == self.workspace_id)
        
        if self.conversation_id:
            stmt = stmt.where(Message.conversation_id == self.conversation_id)
        else:
            stmt = stmt.where(Message.conversation_id.is_(None))
        
        stmt = stmt.where(Message.status == 'completed')
        stmt = stmt.order_by(Message.created_at.desc()).limit(limit)
        
        result = await db.execute(stmt)
        messages = list(reversed(result.scalars().all()))  # Oldest first
        
        return messages
    
    async def get_context_window(
        self, 
        db: Session, 
        max_tokens: int = DEFAULT_CONTEXT_WINDOW
    ) -> List[Message]:
        """
        Lấy messages trong context window.
        
        Logic:
        - Bắt đầu từ tin nhắn mới nhất
        - Cộng dồn tokens đến khi đạt max_tokens
        - Trả về danh sách theo thứ tự thời gian (cũ → mới)
        """
        messages = await self.load_messages(db)
        
        if not messages:
            return []
        
        # Tính tổng tokens từ mới nhất đến cũ nhất
        total_tokens = 0
        window = []
        
        for msg in reversed(messages):
            msg_tokens = msg.tokens or (len(msg.content) // 4)
            total_tokens += msg_tokens
            
            if total_tokens > max_tokens:
                break
            
            window.append(msg)
        
        # Đảo ngược để có thứ tự thời gian
        return list(reversed(window))
    
    async def should_summarize(
        self, 
        db: Session,
        threshold: int = SUMMARY_THRESHOLD
    ) -> bool:
        """Kiểm tra có cần summarize không."""
        messages = await self.load_messages(db)
        total_tokens = sum(m.tokens or (len(m.content) // 4) for m in messages)
        return total_tokens > threshold
    
    async def summarize_old_messages(
        self,
        db: Session,
        keep_recent: int = 10,
    ) -> Optional[str]:
        """
        Tóm tắt các tin nhắn cũ, giữ lại N tin gần nhất.
        
        Returns:
            Summary text hoặc None nếu không cần summarize
        """
        messages = await self.load_messages(db)
        
        if len(messages) <= keep_recent:
            return None
        
        # Tách messages cũ và gần
        recent_msgs = messages[-keep_recent:]
        old_msgs = messages[:-keep_recent]
        
        # Format old messages cho summarization
        summary_input = "\n".join([
            f"{i+1}. [{m.role}]: {m.content[:200]}"
            for i, m in enumerate(old_msgs)
        ])
        
        # Gọi AI summarize
        try:
            result = await ai_gateway.generate(
                prompt=f"Tóm tắt cuộc trò chuyện sau (tối đa 300 chữ):\n{summary_input}",
                system_prompt="Bạn là trợ lý tóm tắt hội thoại. Trả về tóm tắt ngắn gọn, súc tích.",
                temperature=0.3,
                max_tokens=300,
            )
            return result.get("content", "").strip()
        except Exception as e:
            logger.warning(f"Failed to summarize: {e}")
            return None
    
    async def build_history_for_rag(
        self,
        db: Session,
        max_turns: int = 6,
    ) -> List[dict]:
        """
        Build history cho RAG prompt (Q&A pairs).
        
        Returns:
            List of {"question": ..., "answer": ...}
        """
        messages = await self.get_context_window(db)
        
        # Lọc chỉ user/assistant messages
        chat_msgs = [m for m in messages if m.role in ['user', 'assistant']]
        
        # Group thành pairs
        history = []
        for i in range(0, len(chat_msgs) - 1, 2):
            if chat_msgs[i].role == 'user' and chat_msgs[i+1].role == 'assistant':
                history.append({
                    "question": chat_msgs[i].content,
                    "answer": chat_msgs[i+1].content,
                })
        
        return history[:max_turns]


async def get_conversation_stats(
    db: Session,
    workspace_id: int,
    conversation_id: Optional[str] = None,
) -> dict:
    """Get stats cho conversation."""
    stmt = select(Message).where(Message.workspace_id == workspace_id)
    
    if conversation_id:
        stmt = stmt.where(Message.conversation_id == conversation_id)
    else:
        stmt = stmt.where(Message.conversation_id.is_(None))
    
    result = await db.execute(stmt)
    messages = result.scalars().all()
    
    total_tokens = sum(m.tokens or (len(m.content) // 4) for m in messages)
    
    return {
        "message_count": len(messages),
        "total_tokens": total_tokens,
        "context_percentage": min(100, int(total_tokens / DEFAULT_CONTEXT_WINDOW * 100)),
        "needs_summary": total_tokens > SUMMARY_THRESHOLD,
    }
