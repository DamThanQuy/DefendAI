"""Bookings router — Quy trình đặt lịch Mock Room.

Flow:
  Student (role=student) tạo booking -> Mentor (role=mentor) xác nhận + chốt giờ
  -> trước confirmed_time 5 phút, phòng (Meeting) được mở cho cả 2 vào.

Quy tắc phân quyền (ADR-005: no-auth MVP, nhưng đã có RBAC cơ bản):
  - Tạo booking: chỉ student
  - Xem booking của mình: student xem của mình, mentor xem của mình
  - Confirm/reject: chỉ mentor được chỉ định
"""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.user import User
from app.models.booking import BookingStatus, MockBooking
from app.models.meeting import Meeting, MeetingStatus
from app.repositories.booking import BookingRepository
from app.schemas.booking import BookingCreate, BookingConfirm, BookingOut


def _naive_utc(dt: datetime) -> datetime:
    """Chuẩn hóa datetime về naive UTC (DB column là TIMESTAMP WITHOUT TIME ZONE)."""
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt

# Phòng mở trước bao nhiêu phút so với confirmed_time
ROOM_OPEN_BEFORE_MINUTES = 5

router = APIRouter(prefix="/api/bookings", tags=["Bookings"])


def _serialize(booking: MockBooking, room_open: bool = False) -> BookingOut:
    return BookingOut(
        id=booking.id,
        student_id=booking.student_id,
        mentor_id=booking.mentor_id,
        proposed_time=booking.proposed_time,
        confirmed_time=booking.confirmed_time,
        title=booking.title,
        note=booking.note,
        status=booking.status,
        meeting_id=booking.meeting_id,
        created_at=booking.created_at,
        updated_at=booking.updated_at,
        student_name=booking.student.full_name if booking.student else None,
        mentor_name=booking.mentor.full_name if booking.mentor else None,
        room_open=room_open,
    )


def _is_room_open(booking: MockBooking) -> bool:
    """Phòng mở khi: đã confirmed, có confirmed_time, và còn <=5p nữa là tới giờ."""
    if booking.status != BookingStatus.confirmed or not booking.confirmed_time:
        return False
    now = datetime.utcnow()
    delta = booking.confirmed_time - now
    return timedelta(0) <= delta <= timedelta(minutes=ROOM_OPEN_BEFORE_MINUTES)


# ---------------------------------------------------------------------------
# Student endpoints
# ---------------------------------------------------------------------------

@router.post("", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
async def create_booking(
    payload: BookingCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("student")),
):
    # Mentor phải tồn tại
    mentor = (
        await db.execute(select(User).where(User.id == payload.mentor_id))
    ).scalar_one_or_none()
    if not mentor:
        raise HTTPException(status_code=404, detail="Mentor không tồn tại")

    # Không cho đặt với chính mình
    if mentor.id == user.id:
        raise HTTPException(status_code=400, detail="Không thể đặt lịch với chính mình")

    # Không cho đặt thời gian trong quá khứ
    proposed = _naive_utc(payload.proposed_time)
    if proposed <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="Thời gian đề xuất phải ở tương lai")

    booking = MockBooking(
        student_id=user.id,
        mentor_id=mentor.id,
        proposed_time=proposed,
        title=payload.title,
        note=payload.note,
        status=BookingStatus.pending,
    )
    repo = BookingRepository(db)
    booking = await repo.add(booking)
    # reload để có relationship student/mentor
    booking = await repo.get_with_participants(booking.id)
    return _serialize(booking)


@router.get("/mine", response_model=List[BookingOut])
async def my_bookings(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    repo = BookingRepository(db)
    if any(r.name == "mentor" for r in user.roles):
        bookings = await repo.list_by_mentor(user.id)
    else:
        bookings = await repo.list_by_student(user.id)
    result = []
    for b in bookings:
        b = await repo.get_with_participants(b.id)
        result.append(_serialize(b, _is_room_open(b)))
    return result


@router.post("/{booking_id}/cancel", response_model=BookingOut)
async def cancel_booking(
    booking_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("student")),
):
    repo = BookingRepository(db)
    booking = await repo.get_with_participants(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking không tồn tại")
    if booking.student_id != user.id:
        raise HTTPException(status_code=403, detail="Chỉ sinh viên tạo mới được huỷ")
    if booking.status != BookingStatus.pending:
        raise HTTPException(status_code=400, detail="Chỉ huỷ được booking chưa xác nhận")
    booking.status = BookingStatus.cancelled
    booking = await repo.update(booking)
    return _serialize(booking)


# ---------------------------------------------------------------------------
# Mentor endpoints
# ---------------------------------------------------------------------------

@router.get("/pending", response_model=List[BookingOut])
async def pending_bookings(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("mentor")),
):
    repo = BookingRepository(db)
    bookings = await repo.list_pending_for_mentor(user.id)
    result = []
    for b in bookings:
        b = await repo.get_with_participants(b.id)
        result.append(_serialize(b))
    return result


@router.post("/{booking_id}/confirm", response_model=BookingOut)
async def confirm_booking(
    booking_id: int,
    payload: BookingConfirm,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("mentor")),
):
    repo = BookingRepository(db)
    booking = await repo.get_with_participants(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking không tồn tại")
    if booking.mentor_id != user.id:
        raise HTTPException(status_code=403, detail="Chỉ mentor được chỉ định mới xác nhận")
    if booking.status != BookingStatus.pending:
        raise HTTPException(status_code=400, detail="Booking này không ở trạng thái chờ xác nhận")

    confirmed = _naive_utc(payload.confirmed_time)
    if confirmed <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="Thời gian chốt phải ở tương lai")

    booking.confirmed_time = confirmed
    booking.status = BookingStatus.confirmed
    if payload.note is not None:
        booking.note = payload.note

    # Tạo phòng họp (Meeting) tương ứng — phòng sẽ mở trước 5 phút
    meeting = Meeting(
        name=booking.title,
        status=MeetingStatus.scheduled,
        phase="presentation",
        timer_seconds=1800,  # 30 phút mặc định
    )
    db.add(meeting)
    await db.flush()
    booking.meeting_id = meeting.id

    booking = await repo.update(booking)
    booking = await repo.get_with_participants(booking.id)
    return _serialize(booking, _is_room_open(booking))


@router.post("/{booking_id}/reject", response_model=BookingOut)
async def reject_booking(
    booking_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("mentor")),
):
    repo = BookingRepository(db)
    booking = await repo.get_with_participants(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking không tồn tại")
    if booking.mentor_id != user.id:
        raise HTTPException(status_code=403, detail="Chỉ mentor được chỉ định mới từ chối")
    if booking.status != BookingStatus.pending:
        raise HTTPException(status_code=400, detail="Booking này không ở trạng thái chờ xác nhận")
    booking.status = BookingStatus.rejected
    booking = await repo.update(booking)
    return _serialize(booking)


@router.post("/{booking_id}/complete", response_model=BookingOut)
async def complete_booking(
    booking_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("mentor")),
):
    """Mentor kết thúc buổi mock -> đánh dấu completed."""
    repo = BookingRepository(db)
    booking = await repo.get_with_participants(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking không tồn tại")
    if booking.mentor_id != user.id:
        raise HTTPException(status_code=403, detail="Chỉ mentor được chỉ định mới kết thúc")
    if booking.status != BookingStatus.confirmed:
        raise HTTPException(status_code=400, detail="Chỉ booking đã xác nhận mới kết thúc được")
    booking.status = BookingStatus.completed
    if booking.meeting_id:
        meeting = (
            await db.execute(select(Meeting).where(Meeting.id == booking.meeting_id))
        ).scalar_one_or_none()
        if meeting:
            meeting.status = MeetingStatus.ended
            await db.flush()
    booking = await repo.update(booking)
    return _serialize(booking)
