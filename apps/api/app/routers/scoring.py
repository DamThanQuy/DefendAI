"""Router scoring — form chấm điểm DB-driven theo rubric SEP490 (BR-A1).

- GET  /api/scoring/rubric               → khung rubric (OGA 7 + TDA 9) đọc từ DB
- PUT  /api/scoring/meetings/{id}/scores → upsert điểm per item, logged
- GET  /api/scoring/meetings/{id}/summary  → điểm OGA/TDA/Final + verdict (per nhóm)
Không hard-code tiêu chí — mọi weight/ngưỡng lấy từ rubric config.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.defense_score import DefenseScore, DefenseScoreAudit
from app.models.meeting import Meeting
from app.models.user import User
from app.services.rubric_service import get_rubric_by_key
from app.services.scoring_service import final_score

router = APIRouter(prefix="/api/scoring", tags=["Scoring"])

RUBRIC_KEY = "defense_sep490"


class ScoreEntry(BaseModel):
    group: str = Field(pattern="^(OGA|TDA)$")
    item_code: str = Field(min_length=1, max_length=40)
    mark: float = Field(ge=0, le=10)
    comment: Optional[str] = None


class ScoreUpsertRequest(BaseModel):
    scores: List[ScoreEntry]


async def _load_rubric_config(db: AsyncSession) -> dict:
    rubric = await get_rubric_by_key(db, RUBRIC_KEY)
    if not rubric or not rubric.is_active:
        raise HTTPException(
            status_code=503,
            detail=f"Rubric {RUBRIC_KEY} chưa được seed/kích hoạt",
        )
    return dict(rubric.config)


def _validate_items(config: dict, group: str, item_code: str) -> None:
    key = "oga" if group == "OGA" else "tda"
    items = config.get("grading", {}).get(key, {}).get("items", {})
    if item_code not in items:
        raise HTTPException(
            status_code=422,
            detail=f"item_code '{item_code}' không có trong rubric {key} (hợp lệ: {sorted(items)})",
        )


@router.get("/rubric", summary="Khung rubric chấm bảo vệ OGA/TDA từ DB")
async def get_scoring_rubric(db: AsyncSession = Depends(get_db)) -> dict:
    config = await _load_rubric_config(db)
    grading = config["grading"]
    subject = config.get("subject", {})

    def _items(key: str) -> list[dict]:
        weights = grading.get(key, {}).get("items", {})
        return [{"code": c, "weight": w} for c, w in weights.items()]

    return {
        "key": RUBRIC_KEY,
        "scale_max": subject.get("scale", 10),
        "decimals": 1,
        "pass_mark": subject.get("min_avg_to_pass", 5),
        "groups": [
            {"group": "OGA", "weight_pct": grading["oga"]["weight"], "items": _items("oga")},
            {"group": "TDA", "weight_pct": grading["tda"]["weight"], "items": _items("tda")},
        ],
    }


@router.put("/meetings/{meeting_id}/scores", summary="Upsert điểm chấm (per item, logged)")
async def upsert_scores(
    meeting_id: int,
    req: ScoreUpsertRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    meeting = (
        await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    ).scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Phòng họp không tồn tại")
    config = await _load_rubric_config(db)

    upserted = 0
    for entry in req.scores:
        _validate_items(config, entry.group, entry.item_code)
        row = (
            await db.execute(
                select(DefenseScore).where(
                    DefenseScore.meeting_id == meeting_id,
                    DefenseScore.reviewer_id == user.id,
                    DefenseScore.group == entry.group,
                    DefenseScore.item_code == entry.item_code,
                )
            )
        ).scalar_one_or_none()

        before = None
        if row:
            before = json.dumps({"mark": float(row.mark), "comment": row.comment})
            row.mark = entry.mark
            row.comment = entry.comment
            row.updated_at = datetime.utcnow()
            action = "update"
        else:
            row = DefenseScore(
                meeting_id=meeting_id,
                reviewer_id=user.id,
                reviewer_name=user.full_name or user.username,
                group=entry.group,
                item_code=entry.item_code,
                mark=entry.mark,
                comment=entry.comment,
            )
            db.add(row)
            action = "insert"
            await db.flush()

        db.add(
            DefenseScoreAudit(
                score_id=row.id,
                action=action,
                actor_id=user.id,
                before=before,
                after=json.dumps({"mark": entry.mark, "comment": entry.comment}),
            )
        )
        upserted += 1

    await db.commit()
    return {"meeting_id": meeting_id, "upserted": upserted}


@router.get(
    "/meetings/{meeting_id}/summary",
    summary="Điểm tổng hợp OGA/TDA/Final + verdict (per nhóm)",
)
async def scoring_summary(meeting_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    """Tính điểm per nhóm — nhiều reviewer trên cùng item → trung bình trước,
    rồi weighted-average theo rubric (sinh viên đồng điểm cả nhóm)."""
    config = await _load_rubric_config(db)
    rows = (
        await db.execute(
            select(DefenseScore).where(DefenseScore.meeting_id == meeting_id)
        )
    ).scalars().all()

    if not rows:
        return {
            "meeting_id": meeting_id,
            "oga": None,
            "tda": None,
            "final": None,
            "verdict": "incomplete",
            "note": "Chưa có điểm nào được chấm.",
        }

    # Gom mark theo (group, item_code) → trung bình nếu nhiều reviewer
    by_item: dict = {}
    for r in rows:
        key = f"{r.group}:{r.item_code}"
        by_item.setdefault(key, []).append(float(r.mark))

    oga_items: dict = {}
    tda_items: dict = {}
    for key, marks in by_item.items():
        group, item_code = key.split(":", 1)
        avg_mark = sum(marks) / len(marks)
        if group == "OGA":
            oga_items[item_code] = avg_mark
        else:
            tda_items[item_code] = avg_mark

    result = final_score(oga_items, tda_items, config)
    return {"meeting_id": meeting_id, **result}
