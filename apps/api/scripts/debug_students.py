"""Debug: test students endpoint logic directly."""
import asyncio
from sqlalchemy import select
from app.core.database import async_session_maker
from app.models.meeting import MeetingMember


async def main():
    async with async_session_maker() as db:
        rows = (
            await db.execute(
                select(MeetingMember).where(
                    MeetingMember.meeting_id == 1,
                    MeetingMember.role == "student",
                )
            )
        ).scalars().all()
        print("result:", [(m.id, m.name, m.role) for m in rows])


if __name__ == "__main__":
    asyncio.run(main())
