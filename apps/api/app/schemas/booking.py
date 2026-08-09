from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.booking import BookingStatus


class BookingCreate(BaseModel):
    """Sinh viên gửi yêu cầu đặt lịch."""

    mentor_id: int
    proposed_time: datetime
    title: str
    note: Optional[str] = None


class BookingConfirm(BaseModel):
    """Mentor xác nhận + chốt thời gian (có thể khác proposed_time)."""

    confirmed_time: datetime
    # Mentor có thể ghi chú thêm khi xác nhận
    note: Optional[str] = None

class BookingReschedule(BaseModel):
    """Mentor đề xuất đổi giờ (reschedule) — sinh viên sẽ nhận thông báo."""

    proposed_time: datetime
    note: Optional[str] = None

class BookingReject(BaseModel):
    """Mentor từ chối kèm lý do."""

    reason: str = Field(..., min_length=1, max_length=500)


class BookingOut(BaseModel):
    """Response hiển thị thông tin booking."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    mentor_id: int
    proposed_time: datetime
    confirmed_time: Optional[datetime] = None
    title: str
    note: Optional[str] = None
    status: BookingStatus
    meeting_id: Optional[int] = None
    reject_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    # Trường mở rộng (điền từ FE hoặc join) — để FE dễ hiển thị
    student_name: Optional[str] = None
    mentor_name: Optional[str] = None
    # Cờ phòng đã mở (còn <=5p và confirmed)
    room_open: Optional[bool] = None
