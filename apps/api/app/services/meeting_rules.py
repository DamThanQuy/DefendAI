"""Rule check BR-B1 cho 1 meeting — dùng chung cho /api/rules và báo cáo sinh viên.

Input lấy từ dữ liệu thật của buổi/đồ án. THIẾU dữ liệu → None để rule trả
pending_data (trước đây workspace chưa có UC bị tính UC=0 → violated, chưa
quét code bị tính defect=0 → pass, gây kết luận sai).
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.committee_decision import CommitteeDecision
from app.models.defense_score import DefenseScore
from app.models.meeting import Meeting
from app.services.defect_counter import _list_workspace_analysis_ids, get_workspace_defect_stats
from app.services.meeting_workspace import find_workspace_for_meeting
from app.services.rubric_service import get_rubric_by_key
from app.services.rules import evaluate_all_rules, to_dict
from app.services.scoring_service import final_score
from app.services.use_case_mapper import get_workspace_uc_stats

RUBRIC_KEY = "defense_sep490"


async def _official_oga_score(
    db: AsyncSession, meeting_id: int, rubric_cfg: dict[str, Any]
) -> Optional[float]:
    """Điểm OGA từ điểm mentor/admin (is_ai=False) — trung bình theo item rồi weighted."""
    rows = (
        await db.execute(
            select(DefenseScore).where(
                DefenseScore.meeting_id == meeting_id,
                DefenseScore.group == "OGA",
                DefenseScore.is_ai.is_(False),
            )
        )
    ).scalars().all()
    if not rows:
        return None
    by_item: dict[str, list[float]] = {}
    for r in rows:
        by_item.setdefault(r.item_code, []).append(float(r.mark))
    result = final_score({k: sum(v) / len(v) for k, v in by_item.items()}, {}, rubric_cfg)
    return result.get("oga", {}).get("score")


async def evaluate_meeting_rules(db: AsyncSession, meeting: Meeting) -> dict[str, Any]:
    rubric = await get_rubric_by_key(db, RUBRIC_KEY)
    rubric_cfg = dict(rubric.config) if rubric else {}
    subject = rubric_cfg.get("subject", {})

    oga_score = await _official_oga_score(db, meeting.id, rubric_cfg)

    total_uc: Optional[int] = None
    completion_ratio: Optional[float] = None
    n_logic: Optional[int] = None
    n_showstopper: Optional[int] = None
    workspace = await find_workspace_for_meeting(db, meeting)
    if workspace:
        uc = await get_workspace_uc_stats(db, workspace.id)
        if uc.total > 0:
            # total_uc = committed + completed (bỏ omitted, Student Guide §4.2)
            total_uc = uc.committed + uc.completed
            completion_ratio = uc.completion_ratio
        if await _list_workspace_analysis_ids(db, workspace.id):
            defects = await get_workspace_defect_stats(db, workspace.id)
            n_logic, n_showstopper = defects.n_logic, defects.n_showstopper

    rules = await evaluate_all_rules(
        db,
        oga_score,
        completion_ratio=completion_ratio,
        total_uc=total_uc,
        n_logic=n_logic,
        n_showstopper=n_showstopper,
    )

    # Quyết định hội đồng: nhiều lần tick cùng rule → lấy lần mới nhất
    decisions: dict[str, CommitteeDecision] = {}
    for d in (
        await db.execute(
            select(CommitteeDecision)
            .where(CommitteeDecision.meeting_id == meeting.id)
            .order_by(CommitteeDecision.created_at.asc(), CommitteeDecision.id.asc())
        )
    ).scalars().all():
        decisions[d.rule_id] = d

    return {
        "oga_score": oga_score,
        "pass_mark": float(subject.get("min_avg_to_pass", 5.0)),
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
