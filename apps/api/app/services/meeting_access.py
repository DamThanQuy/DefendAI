"""Quyền truy cập 1 buổi bảo vệ (meeting) — dùng chung cho reports/scoring/rules.

- admin: mọi meeting.
- student: meeting của chính mình (meetings.student_id), hoặc booking mà mình
  là student chủ trì / được mời.
- mentor: meeting thuộc booking mà mình là mentor được chỉ định.
Chấm điểm / tick rule: chỉ admin hoặc mentor được chỉ định của booking.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import MockBooking
from app.models.meeting import Meeting
from app.models.user import User


def role_names(user: User) -> set[str]:
    return {r.name for r in (user.roles or [])}


async def get_meeting_booking(db: AsyncSession, meeting_id: int) -> Optional[MockBooking]:
    result = await db.execute(select(MockBooking).where(MockBooking.meeting_id == meeting_id))
    return result.scalars().first()


def _is_invited(booking: MockBooking, user_id: int) -> bool:
    return any(
        isinstance(s, dict) and s.get("user_id") == user_id
        for s in (booking.invited_students or [])
    )


async def can_view_meeting(db: AsyncSession, user: User, meeting: Meeting) -> bool:
    if "admin" in role_names(user):
        return True
    if meeting.student_id is not None and meeting.student_id == user.id:
        return True
    booking = await get_meeting_booking(db, meeting.id)
    if booking is None:
        return False
    return (
        booking.student_id == user.id
        or booking.mentor_id == user.id
        or _is_invited(booking, user.id)
    )


async def can_score_meeting(db: AsyncSession, user: User, meeting: Meeting) -> bool:
    roles = role_names(user)
    if "admin" in roles:
        return True
    if "mentor" not in roles:
        return False
    booking = await get_meeting_booking(db, meeting.id)
    return booking is not None and booking.mentor_id == user.id
