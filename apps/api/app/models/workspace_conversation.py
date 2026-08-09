"""WorkspaceConversation — tên hiển thị của 1 đoạn chat (conversation) trong workspace.

Conversation_id (uuid hex) nằm trên từng row workspace_chats; bảng này lưu thêm
tên tuỳ chỉnh. Không có row trong bảng này → hiển thị tên mặc định "Đoạn {id[:8]}".
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from app.core.database import Base


class WorkspaceConversation(Base):
    __tablename__ = "workspace_conversations"

    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, index=True)
    conversation_id = Column(String(50), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("workspace_id", "conversation_id", name="uq_ws_conv"),
    )