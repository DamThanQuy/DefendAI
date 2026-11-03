"""Router rules — bảng rule check BR-B1 (agent đề xuất, hội đồng quyết).

- GET  /api/rules/meetings/{id}/check         → agent tính rule tự động + hội đồng-tick
- POST /api/rules/meetings/{id}/decisions     → hội đồng tick confirm/reject (logged)

Xem: người tham gia buổi (SV chủ / mentor booking) hoặc admin.
Tick: mentor phụ trách buổi hoặc admin.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.committee_decision import CommitteeDecision
from app.models.meeting import Meeting
from app.models.user import User
from app.services.meeting_access import can_score_meeting, can_view_meeting
from app.services.meeting_rules import evaluate_meeting_rules

router = APIRouter(prefix="/api/rules", tags=["Rules"])


class RuleDecision(BaseModel):
    rule_id: str
    decision: str  # confirm | reject
    comment: Optional[str] = None


async def _get_meeting(db: AsyncSession, meeting_id: int) -> Meeting:
    meeting = (
        await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    ).scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Phòng không tồn tại")
    return meeting


@router.get(
    "/meetings/{meeting_id}/check",
    summary="Agent tính 7 rule + hội đồng-tick (BR-B1)",
)
async def check_rules(
    meeting_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    meeting = await _get_meeting(db, meeting_id)
    if not await can_view_meeting(db, user, meeting):
        raise HTTPException(status_code=403, detail="Không đủ quyền xem rule check buổi này")
    return {"meeting_id": meeting_id, **await evaluate_meeting_rules(db, meeting)}


@router.post(
    "/meetings/{meeting_id}/decisions",
    summary="Hội đồng tick confirm/reject 1 rule (BR-B1)",
)
async def submit_decision(
    meeting_id: int,
    req: list[RuleDecision],
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "mentor")),
) -> dict:
    meeting = await _get_meeting(db, meeting_id)
    if not await can_score_meeting(db, user, meeting):
        raise HTTPException(status_code=403, detail="Chỉ mentor phụ trách buổi này hoặc admin mới được tick")

    for d in req:
        if d.decision not in ("confirm", "reject"):
            raise HTTPException(
                status_code=422,
                detail="decision phải là 'confirm' hoặc 'reject'",
            )

    saved = 0
    for d in req:
        db.add(
            CommitteeDecision(
                meeting_id=meeting_id,
                reviewer_id=user.id,
                reviewer_name=user.full_name or user.username,
                rule_id=d.rule_id,
                decision=d.decision,
                comment=d.comment,
            )
        )
        saved += 1
    await db.commit()
    return {"meeting_id": meeting_id, "saved": saved}
