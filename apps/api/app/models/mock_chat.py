"""MockChatMessage — lịch sử chat của sinh viên với Mentor AI trong Mock Room AI.

Một row = một tin nhắn trong phòng chat. Theo `user_id` để khi sinh viên
rời phòng rồi vào lại vẫn xem được toàn bộ hội thoại (feature: giữ lịch sử chat).
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.core.database import Base


class MockChatMessage(Base):
    __tablename__ = "mock_chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # "user" (sinh viên) | "assistant" (Mentor/Giám khảo AI)
    role = Column(String(16), nullable=False)
    content = Column(Text, nullable=False)
    # HH:MM hiển thị trên UI (giữ nguyên giờ tin nhắn gốc khi khôi phục)
    time_label = Column(String(16), nullable=True)
    # Tài liệu đồ án đang làm ngữ cảnh khi chat (NULL = chat tự do)
    document_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
