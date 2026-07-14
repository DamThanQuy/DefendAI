from typing import List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.base_repository import BaseRepository
from app.models.meeting import MeetingMessage

class MeetingMessageRepository(BaseRepository[MeetingMessage]):
    def __init__(self, db: AsyncSession):
        super().__init__(db, MeetingMessage)

    async def get_by_meeting_id(self, meeting_id: int) -> List[MeetingMessage]:
        result = await self.db.execute(
            select(self.model).where(self.model.meeting_id == meeting_id).order_by(self.model.created_at.asc())
        )
        return list(result.scalars().all())
