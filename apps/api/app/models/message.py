"""
Model: Message (ChatGPT-style)

Lưu trữ hội thoại dạng flat messages thay vì Q&A pairs.
Hỗ trợ:
- System/User/Assistant roles
- Token tracking per-message
- Context window management (sliding window + summary)
- Conversation isolation (workspace + conversation_id)
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship

from app.core.database import Base


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_messages_workspace_id", "workspace_id"),
        Index("ix_messages_conversation_id", "conversation_id"),
        Index("ix_messages_created_at", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, index=True)
    
    # Conversation group (NULL = mặc định, hoặc UUID segment)
    conversation_id = Column(String(50), nullable=True, index=True)
    
    # Message role: system | user | assistant
    role = Column(String(20), nullable=False, index=True)
    
    # Message content (question or answer)
    content = Column(Text, nullable=False)
    
    # Citations/sources (JSON array)
    citations = Column("citations", Text, nullable=True)  # JSON string
    
    # Token estimation (4 chars ≈ 1 token)
    tokens = Column(Integer, nullable=True)
    
    # Status (completed | failed | processing)
    status = Column(String(20), nullable=False, default="completed")
    
    # Error message (nếu failed)
    error = Column(Text, nullable=True)
    
    # Persona (teacher | critic | expert)
    persona = Column(String(50), nullable=False, default="theory")
    
    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    # Relationships
    workspace = relationship("Workspace", back_populates="messages")
    
    def estimate_tokens(self) -> int:
        """Estimate token count (rough: 4 chars ≈ 1 token)."""
        return len(self.content) // 4
    
    def to_dict(self) -> dict:
        """Convert to dict for API response."""
        return {
            "id": self.id,
            "workspace_id": self.workspace_id,
            "conversation_id": self.conversation_id,
            "role": self.role,
            "content": self.content,
            "citations": self.citations,
            "tokens": self.tokens or self.estimate_tokens(),
            "status": self.status,
            "error": self.error,
            "persona": self.persona,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
