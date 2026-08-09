from datetime import datetime
from enum import Enum

from sqlalchemy import Column, Integer, String, DateTime, Enum as SQLEnum, ForeignKey
from sqlalchemy.orm import relationship

from app.core.database import Base


class BookingStatus(str, Enum):
    """Trạng thái của một yêu cầu đặt lịch Mock Room.

    pending   : sinh viên vừa gửi yêu cầu, chờ mentor xác nhận
    confirmed : mentor đã chốt thời gian -> phòng sẽ mở trước 5 phút
    rejected  : mentor từ chối
    completed : đã qua thời gian họp (hoặc mentor kết thúc)
    cancelled : sinh viên huỷ trước khi confirmed
    """

    pending = "pending"
    confirmed = "confirmed"
    rejected = "rejected"
    completed = "completed"
    cancelled = "cancelled"


class MockBooking(Base):
    """Yêu cầu đặt lịch Mock Defense giữa sinh viên và mentor.

    Quy trình:
      student tạo booking (proposed_time) -> mentor confirm + chốt confirmed_time
      -> trước confirmed_time 5 phút, phòng (meeting) được mở cho cả 2 vào.
    """

    __tablename__ = "mock_bookings"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    mentor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Thời gian sinh viên đề xuất (ban đầu)
    proposed_time = Column(DateTime, nullable=False)
    # Thời gian cuối cùng được chốt (chỉ có sau khi mentor confirm)
    confirmed_time = Column(DateTime, nullable=True)

    # Tiêu đề / ghi chú buổi mock (vd: "Bảo vệ đồ án Nhóm 5")
    title = Column(String(255), nullable=False)
    note = Column(String(1000), nullable=True)
    # Lý do mentor từ chối (chỉ khi status=rejected)
    reject_reason = Column(String(500), nullable=True)

    status = Column(
        SQLEnum(BookingStatus),
        default=BookingStatus.pending,
        nullable=False,
        index=True,
    )

    # Liên kết tới phòng họp (meeting) được tạo khi confirm
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    student = relationship("User", foreign_keys=[student_id])
    mentor = relationship("User", foreign_keys=[mentor_id])
    meeting = relationship("Meeting", foreign_keys=[meeting_id])
