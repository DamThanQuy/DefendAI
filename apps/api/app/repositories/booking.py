from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.repositories.base_repository import BaseRepository
from app.models.booking import BookingStatus, MockBooking


class BookingRepository(BaseRepository[MockBooking]):
    """Repository cho MockBooking — tuân thủ Repository pattern (ADR-003)."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, MockBooking)

    async def list_by_student(self, student_id: int) -> List[MockBooking]:
        result = await self.db.execute(
            select(MockBooking)
            .where(MockBooking.student_id == student_id)
            .order_by(MockBooking.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_by_mentor(self, mentor_id: int) -> List[MockBooking]:
        result = await self.db.execute(
            select(MockBooking)
            .where(MockBooking.mentor_id == mentor_id)
            .order_by(MockBooking.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_pending_for_mentor(self, mentor_id: int) -> List[MockBooking]:
        result = await self.db.execute(
            select(MockBooking)
            .where(
                MockBooking.mentor_id == mentor_id,
                MockBooking.status == BookingStatus.pending,
            )
            .order_by(MockBooking.created_at.asc())
        )
        return list(result.scalars().all())

    async def get_with_participants(self, booking_id: int) -> Optional[MockBooking]:
        # Eager-load student/mentor để tránh lazy-load trong async context
        result = await self.db.execute(
            select(MockBooking)
            .options(selectinload(MockBooking.student), selectinload(MockBooking.mentor))
            .where(MockBooking.id == booking_id)
        )
        return result.scalar_one_or_none()
