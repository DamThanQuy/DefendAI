from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class MentorAvailability(Base):
    """Khung giờ rảnh của mentor (Availability Management).

    Mentor đánh dấu các khung giờ có thể nhận lịch trên lịch tuần.
    Sinh viên chỉ được đặt lịch vào những khung giờ mentor bật (is_available=True)
    và khớp với proposed_time.

    Cấu trúc: 1 dòng = 1 khung giờ lặp lại mỗi tuần.
    - day_of_week: 0=Thứ 2 ... 6=Chủ nhật
    - start_time / end_time: giờ trong ngày (HH:MM, lưu dạng string "08:00")
    - is_available: True = rảnh (sinh viên đặt được), False = bận
    - week_pattern: "all" (mọi tuần) — mở rộng sau này nếu cần (vd: tuần chẵn/lẻ)
    """

    __tablename__ = "mentor_availability"
    __table_args__ = (
        UniqueConstraint(
            "mentor_id", "day_of_week", "start_time", "week_pattern",
            name="uq_mentor_slot",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    mentor_id = Column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    day_of_week = Column(Integer, nullable=False)  # 0..6
    start_time = Column(String(5), nullable=False)  # "08:00"
    end_time = Column(String(5), nullable=False)  # "09:00"
    is_available = Column(Boolean, default=True, nullable=False)
    week_pattern = Column(String(20), default="all", nullable=False)

    mentor = relationship("User", foreign_keys=[mentor_id])
