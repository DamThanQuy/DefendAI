"""Router rules — bảng rule check BR-B1 (agent đề xuất, hội đồng quyết).

- GET  /api/rules/meetings/{id}/check         → agent tính rule tự động + hội đồng-tick
- POST /api/rules/meetings/{id}/decisions     → hội đồng tick confirm/reject (logged)
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_role
from app.models.committee_decision import CommitteeDecision
from app.models.defense_score import DefenseScore
from app.models.meeting import Meeting
from app.models.user import User
from app.services.rules import evaluate_all_rules, to_dict
from app.services.rubric_service import get_rubric_by_key
from app.services.scoring_service import final_score
from app.services.meeting_workspace import find_workspace_for_meeting
from app.services.use_case_mapper import get_uc_count_for_rules
from app.services.defect_counter import get_defect_counts_for_rules

router = APIRouter(prefix="/api/rules", tags=["Rules"])


class RuleDecision(BaseModel):
    rule_id: str
    decision: str  # confirm | reject
    comment: Optional[str] = None


@router.get(
    "/meetings/{meeting_id}/check",
    summary="Agent tính 7 rule + hội đồng-tick (BR-B1)",
)
async def check_rules(meeting_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    meeting = (
        await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    ).scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Phòng không tồn tại")

    # Tính OGA từ defense_scores
    rubric = await get_rubric_by_key(db, "defense_sep490")
    rubric_cfg = dict(rubric.config) if rubric else {}
    subject = rubric_cfg.get("subject", {})
    pass_mark = float(subject.get("min_avg_to_pass", 5.0))

    oga_score = None
    score_rows = (
        await db.execute(
            select(DefenseScore).where(
                DefenseScore.meeting_id == meeting_id,
                DefenseScore.group == "OGA",
            )
        )
    ).scalars().all()
    if score_rows:
        by_item: dict = {}
        for r in score_rows:
            by_item.setdefault(r.item_code, []).append(float(r.mark))
        oga_result = final_score(
            {k: sum(v) / len(v) for k, v in by_item.items()},
            {},
            rubric_cfg,
        )
        oga_score = oga_result.get("oga", {}).get("score")

    # BR-B2: feed UC stats từ workspace tương ứng (nếu tìm được)
    completion_ratio = None
    total_uc = None
    # BR-B3: feed defect counts (n_logic, n_showstopper) cùng workspace
    n_logic: int = 0
    n_showstopper: int = 0
    workspace = await find_workspace_for_meeting(db, meeting)
    if workspace:
        total_uc, completion_ratio = await get_uc_count_for_rules(db, workspace.id)
        n_logic, n_showstopper = await get_defect_counts_for_rules(db, workspace.id)

    rules = await evaluate_all_rules(
        db, oga_score,
        completion_ratio=completion_ratio,
        total_uc=total_uc,
        n_logic=n_logic,
        n_showstopper=n_showstopper,
    )

    # Đọc decisions đã tick
    decisions = {
        d.rule_id: d
        for d in (
            await db.execute(
                select(CommitteeDecision).where(
                    CommitteeDecision.meeting_id == meeting_id
                )
            )
        ).scalars().all()
    }

    return {
        "meeting_id": meeting_id,
        "oga_score": oga_score,
        "pass_mark": pass_mark,
        "workspace_id": workspace.id if workspace else None,
        "completion_ratio": completion_ratio,
        "total_uc": total_uc,
        "n_logic": n_logic,
        "n_showstopper": n_showstopper,
        "rules": [
            {
                **to_dict(r),
                "human_decision": decisions[r.rule_id].decision if r.rule_id in decisions else None,
                "human_comment": decisions[r.rule_id].comment if r.rule_id in decisions else None,
                "human_reviewer": decisions[r.rule_id].reviewer_name if r.rule_id in decisions else None,
                "human_at": (
                    decisions[r.rule_id].created_at.isoformat()
                    if r.rule_id in decisions else None
                ),
            }
            for r in rules
        ],
        "has_violations": any(r.auto_status == "violated" for r in rules),
    }


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
    meeting = (
        await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    ).scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Phòng không tồn tại")

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
