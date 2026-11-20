"""Helper — liên kết Meeting ↔ Workspace.

Ưu tiên cột chính thức `meetings.workspace_id`. Meeting chưa gắn workspace
(phòng mock mentor, dữ liệu cũ) → heuristic, nhưng CHỈ trong các workspace của
chính sinh viên chủ buổi (không quét workspace của người khác):

  1. workspace có `name` khớp meeting.name (exact → substring, case-insensitive);
  2. sinh viên chỉ có đúng 1 workspace → dùng luôn;
  3. không xác định được → None (rules engine trả pending_data).
"""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meeting import Meeting
from app.models.workspace import Workspace
from app.services.meeting_access import get_meeting_booking

logger = logging.getLogger(__name__)


async def find_workspace_for_meeting(
    db: AsyncSession, meeting: Meeting
) -> Optional[Workspace]:
    """Tìm Workspace tương ứng với meeting.

    Returns:
        Workspace hoặc None nếu không xác định được.
    """
    if meeting.workspace_id:
        workspace = await db.get(Workspace, meeting.workspace_id)
        if workspace:
            return workspace

    owner_id = meeting.student_id
    if owner_id is None:
        booking = await get_meeting_booking(db, meeting.id)
        owner_id = booking.student_id if booking else None
    if owner_id is None:
        return None

    candidates = (
        await db.execute(
            select(Workspace)
            .where(Workspace.user_id == owner_id)
            .order_by(Workspace.id.desc())
        )
    ).scalars().all()
    if not candidates:
        return None

    target = (meeting.name or "").strip().lower()
    if target:
        for ws in candidates:
            if ws.name.strip().lower() == target:
                return ws
        for ws in candidates:
            name = ws.name.strip().lower()
            if name and (target in name or name in target):
                return ws
    if len(candidates) == 1:
        return candidates[0]

    logger.info(
        "find_workspace_for_meeting: meeting %s name=%r không khớp workspace nào của user %s (%d ws)",
        meeting.id, meeting.name, owner_id, len(candidates),
    )
    return None
