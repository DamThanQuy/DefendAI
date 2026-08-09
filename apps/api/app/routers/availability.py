"""Availability router — Quản lý lịch rảnh của Mentor.

Flow:
  Mentor GET/PUT    /api/availability        -> xem/sửa khung giờ rảnh của mình
  Student GET       /api/availability/{mentor_id} -> xem slot rảnh để đặt lịch
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.user import User
from app.models.availability import MentorAvailability

router = APIRouter(prefix="/api/availability", tags=["Availability"])

WEEKDAYS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"]
DEFAULT_TIMES = [
    "08:00", "09:00", "10:00", "11:00",
    "13:00", "14:00", "15:00", "16:00", "17:00",
]


class SlotIn(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6)
    start_time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    is_available: bool = True
    week_pattern: str = "all"


class SlotOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    mentor_id: int
    day_of_week: int
    start_time: str
    end_time: str
    is_available: bool
    week_pattern: str

    # Trường tiện ích cho FE
    day_name: str | None = None


def _to_out(slot: MentorAvailability) -> SlotOut:
    return SlotOut(
        id=slot.id,
        mentor_id=slot.mentor_id,
        day_of_week=slot.day_of_week,
        start_time=slot.start_time,
        end_time=slot.end_time,
        is_available=slot.is_available,
        week_pattern=slot.week_pattern,
        day_name=WEEKDAYS[slot.day_of_week] if 0 <= slot.day_of_week <= 6 else None,
    )


@router.get("", response_model=list[SlotOut], summary="Xem lịch rảnh của mình (mentor)")
async def get_my_availability(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("mentor")),
):
    """Mentor xem toàn bộ khung giờ rảnh của mình."""
    result = await db.execute(
        select(MentorAvailability)
        .where(MentorAvailability.mentor_id == user.id)
        .order_by(MentorAvailability.day_of_week, MentorAvailability.start_time)
    )
    return [_to_out(s) for s in result.scalars().all()]


@router.put("", response_model=list[SlotOut], summary="Cập nhật lịch rảnh (mentor)")
async def upsert_availability(
    slots: list[SlotOut | SlotIn] = [],  # type: ignore[valid-type]
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("mentor")),
):
    """Thay thế toàn bộ lịch rảnh của mentor bằng danh sách mới.

    FE gửi lên danh sách các slot (chỉ những slot is_available=True mới được lưu
    để tiết kiệm, nhưng vẫn nhận slot False để linh hoạt). Mỗi slot là 1 khung giờ.
    """
    # Xoá slots cũ của mentor
    old = (
        await db.execute(
            select(MentorAvailability).where(MentorAvailability.mentor_id == user.id)
        )
    ).scalars().all()
    for s in old:
        await db.delete(s)
    await db.flush()

    created = []
    for raw in slots:
        data = raw.model_dump() if hasattr(raw, "model_dump") else dict(raw)
        slot = MentorAvailability(
            mentor_id=user.id,
            day_of_week=int(data["day_of_week"]),
            start_time=data["start_time"],
            end_time=data["end_time"],
            is_available=bool(data.get("is_available", True)),
            week_pattern=data.get("week_pattern", "all"),
        )
        db.add(slot)
        created.append(slot)

    await db.commit()
    for s in created:
        await db.refresh(s)
    return [_to_out(s) for s in created]


@router.get("/{mentor_id}", response_model=list[SlotOut],
            summary="Xem slot rảnh của 1 mentor (student đặt lịch)")
async def get_mentor_availability(
    mentor_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Sinh viên xem các khung giờ rảnh (is_available=True) của mentor để đặt lịch."""
    mentor = (
        await db.execute(select(User).where(User.id == mentor_id))
    ).scalar_one_or_none()
    if not mentor:
        raise HTTPException(status_code=404, detail="Mentor không tồn tại")

    result = await db.execute(
        select(MentorAvailability)
        .where(
            MentorAvailability.mentor_id == mentor_id,
            MentorAvailability.is_available == True,  # noqa: E712
        )
        .order_by(MentorAvailability.day_of_week, MentorAvailability.start_time)
    )
    return [_to_out(s) for s in result.scalars().all()]
