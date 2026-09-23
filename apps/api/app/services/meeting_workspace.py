"""Helper — liên kết Meeting ↔ Workspace.

Meeting chưa có cột workspace_id (BR-B2 phase 0) — dùng heuristic đơn giản
để tìm workspace phù hợp với 1 phòng bảo vệ:

  1. Tìm workspace có `name` chứa meeting.name (case-insensitive), ưu tiên
     user là student member trong meeting.
  2. Nếu không match → trả None (rules engine sẽ trả pending_data).

Khi BR-A2 thêm `meeting.workspace_id` chính thức, helper này chỉ cần đổi
1 dòng query.
"""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meeting import Meeting, MemberRole
from app.models.workspace import Workspace

logger = logging.getLogger(__name__)


async def find_workspace_for_meeting(
    db: AsyncSession, meeting: Meeting
) -> Optional[Workspace]:
    """Tìm Workspace tương ứng với meeting (heuristic).

    Returns:
        Workspace hoặc None nếu không match.
    """
    meeting_name = (meeting.name or "").strip()
    if not meeting_name:
        return None

    # 1) Tìm student member trong meeting
    student_member = None
    for m in meeting.members or []:
        if m.role == MemberRole.student:
            student_member = m
            break
    student_name = student_member.name.strip() if student_member and student_member.name else ""

    # 2) Tìm workspace mà user sở hữu và name match meeting.name
    #    (ưu tiên exact match, sau đó substring)
    stmt = select(Workspace).order_by(Workspace.id.desc())
    candidates = (await db.execute(stmt)).scalars().all()
    if not candidates:
        return None

    target = meeting_name.lower()
    # Exact match
    for ws in candidates:
        if ws.name.strip().lower() == target:
            return ws
    # Substring match (workspace name chứa meeting name)
    for ws in candidates:
        if target in ws.name.strip().lower() or ws.name.strip().lower() in target:
            return ws
    # Substring match với student name
    if student_name:
        sn = student_name.lower()
        for ws in candidates:
            if sn in ws.name.strip().lower():
                return ws
    logger.info(
        "find_workspace_for_meeting: meeting %s name=%r không khớp workspace nào (có %d ws)",
        meeting.id, meeting.name, len(candidates),
    )
    return None
