"""MockChatMessage — lịch sử chat của sinh viên với Mentor AI trong Mock Room AI.

Một row = một tin nhắn trong phòng chat. Theo `user_id` + `session_id` để khi
sinh viên rời phòng rồi vào lại vẫn xem được toàn bộ hội thoại, và có thể
danh sách/xem lại từng PHIÊN theo từng tài liệu.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.core.database import Base


class MockChatSession(Base):
    """Một phiên chất vấn của sinh viên với Giám khảo AI.

    Trước đây lịch sử là 1 blob phẳng mỗi user và PUT /history ghi đè toàn cục
    (chat file B xoá lịch sử file A). Từ giờ mỗi phiên được lưu riêng.
    """

    __tablename__ = "mock_chat_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Tài liệu đồ án làm ngữ cảnh cho phiên này (NULL = chat tự do)
    document_id = Column(Integer, nullable=True, index=True)
    # Tiêu đề hiển thị trong danh sách lịch sử (lấy từ tin nhắn đầu của SV)
    title = Column(String(200), nullable=False, default="Phiên chất vấn")
    # Số tin nhắn hiện tại (giữ đồng bộ để list không cần đếm)
    message_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class MockChatMessage(Base):
    __tablename__ = "mock_chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Phiên chứa tin nhắn này. NULL = dữ liệu cũ trước khi có tính năng phiên.
    session_id = Column(
        Integer,
        ForeignKey("mock_chat_sessions.id", ondelete="CASCADE"),
        nullable=True,
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
