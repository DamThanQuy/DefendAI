"""Báo cáo đánh giá sau buổi Mock Defense cho sinh viên.

- GET  /api/reports/my-reports        → danh sách báo cáo của user + thống kê
- GET  /api/reports/{id}              → chi tiết: rubric, điểm OGA/TDA, nhận xét AI,
                                        rule check (§3.6), kết luận, hội thoại
- POST /api/reports/{id}/regenerate   → tổng hợp lại nhận xét AI khi lần trước lỗi

Tiêu chí / trọng số đọc từ rubric DB (BR-A1). AI không chấm điểm số: điểm chỉ
đến từ DefenseScore do mentor/admin chấm.
"""
from datetime import datetime
from typing import Any, Iterable, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.assessment import Evaluation, Report
from app.models.defense_score import DefenseScore
from app.models.document import Document
from app.models.meeting import Meeting
from app.models.mock_chat import MockChatSession
from app.models.user import User
from app.models.workspace import Workspace
from app.services.meeting_access import can_view_meeting, role_names
from app.services.meeting_rules import evaluate_meeting_rules
from app.services.mock_report import enqueue_report_generation
from app.services.report_builder import (
    compute_verdict,
    display_status,
    effective_generation_status,
    review_view,
    round1,
    rubric_view,
    short_title,
    summarize_scores,
)
from app.services.rubric_service import get_rubric_by_key

router = APIRouter(prefix="/api/reports", tags=["reports"])

RUBRIC_KEY = "defense_sep490"


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


async def _names_by_id(
    db: AsyncSession, id_col: Any, name_col: Any, ids: Iterable[Optional[int]]
) -> dict[int, str]:
    wanted = {i for i in ids if i}
    if not wanted:
        return {}
    rows = (await db.execute(select(id_col, name_col).where(id_col.in_(wanted)))).all()
    return {row[0]: row[1] for row in rows}


async def _load_report(db: AsyncSession, report_id: int) -> tuple[Report, Meeting]:
    row = (
        await db.execute(
            select(Report, Meeting)
            .join(Evaluation, Evaluation.id == Report.evaluation_id)
            .join(Meeting, Meeting.id == Evaluation.meeting_id)
            .where(Report.id == report_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Báo cáo không tồn tại")
    return row[0], row[1]


def _is_owner_or_admin(user: User, meeting: Meeting) -> bool:
    return meeting.student_id == user.id or "admin" in role_names(user)


def _description(report: Report, generation_status: str) -> str:
    if generation_status == "pending":
        return "AI đang tổng hợp nhận xét cho buổi bảo vệ thử này…"
    if generation_status == "failed":
        return "Chưa tạo được nhận xét AI — mở báo cáo để thử lại."
    comment = (report.ai_feedback or "").strip()
    if not comment:
        return "Báo cáo buổi bảo vệ thử."
    return comment if len(comment) <= 220 else comment[:220].rstrip() + "…"


def _criteria_brief(report: Report, rubric_cfg: dict[str, Any]) -> list[dict[str, Any]]:
    labels = {c.get("key"): c.get("label") for c in rubric_cfg.get("quality_criteria") or []}
    return [
        {
            "key": item.get("key"),
            "label": labels.get(item.get("key")) or item.get("key"),
            "level": item.get("level"),
        }
        for item in report.quality_criteria or []
        if isinstance(item, dict)
    ]


@router.get("/my-reports")
async def get_my_reports(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Báo cáo các buổi bảo vệ thử của user hiện tại (mới nhất trước)."""
    rows = (
        await db.execute(
            select(Report, Meeting)
            .join(Evaluation, Evaluation.id == Report.evaluation_id)
            .join(Meeting, Meeting.id == Evaluation.meeting_id)
            .where(Meeting.student_id == user.id)
            .order_by(Report.created_at.desc(), Report.id.desc())
        )
    ).all()

    rubric = await get_rubric_by_key(db, RUBRIC_KEY)
    rubric_cfg = dict(rubric.config) if rubric else {}

    scores_by_meeting: dict[int, list[DefenseScore]] = {}
    meeting_ids = {meeting.id for _, meeting in rows}
    if meeting_ids:
        score_rows = (
            await db.execute(select(DefenseScore).where(DefenseScore.meeting_id.in_(meeting_ids)))
        ).scalars().all()
        for s in score_rows:
            scores_by_meeting.setdefault(s.meeting_id, []).append(s)
    workspace_names = await _names_by_id(
        db, Workspace.id, Workspace.name, (meeting.workspace_id for _, meeting in rows)
    )
    document_names = await _names_by_id(
        db, Document.id, Document.filename, (report.document_id for report, _ in rows)
    )
    session_titles = await _names_by_id(
        db, MockChatSession.id, MockChatSession.title, (report.mock_session_id for report, _ in rows)
    )

    now = datetime.utcnow()
    reports = []
    for report, meeting in rows:
        generation_status = effective_generation_status(report, now)
        scores = summarize_scores(scores_by_meeting.get(meeting.id, []), rubric_cfg)
        official = scores["official"]
        workspace_name = workspace_names.get(meeting.workspace_id)
        document_name = document_names.get(report.document_id)
        reports.append({
            "id": report.id,
            "title": short_title(
                workspace_name
                or document_name
                or session_titles.get(report.mock_session_id)
                or meeting.name
            ),
            "description": _description(report, generation_status),
            "source": report.source,
            "status": display_status(generation_status, official is not None),
            "generation_status": generation_status,
            "final_score": official["final"] if official else None,
            "reviewer_count": scores["reviewer_count"],
            "quality_criteria": _criteria_brief(report, rubric_cfg),
            "workspace_id": meeting.workspace_id,
            "workspace_name": workspace_name,
            "document_name": document_name,
            "meeting_id": meeting.id,
            "mock_session_id": report.mock_session_id,
            "created_at": _iso(report.created_at),
            "updated_at": _iso(report.updated_at),
        })

    finals = [r["final_score"] for r in reports if r["final_score"] is not None]
    return {
        "reports": reports,
        "summary": {
            "total": len(reports),
            "completed": sum(1 for r in reports if r["status"] == "completed"),
            "in_review": sum(1 for r in reports if r["status"] == "in_review"),
            "pending": sum(1 for r in reports if r["status"] == "pending"),
            "average_score": round1(sum(finals) / len(finals)) if finals else None,
            "scale_max": rubric_cfg.get("subject", {}).get("scale", 10),
        },
    }


@router.get("/{report_id}")
async def get_report_detail(
    report_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Chi tiết 1 báo cáo. SV chỉ xem được của mình; mentor theo booking; admin xem tất."""
    report, meeting = await _load_report(db, report_id)
    if not await can_view_meeting(db, user, meeting):
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem báo cáo này")

    rubric = await get_rubric_by_key(db, RUBRIC_KEY)
    rubric_cfg = dict(rubric.config) if rubric else {}
    score_rows = (
        await db.execute(select(DefenseScore).where(DefenseScore.meeting_id == meeting.id))
    ).scalars().all()
    scores = summarize_scores(score_rows, rubric_cfg)
    rules = await evaluate_meeting_rules(db, meeting)
    generation_status = effective_generation_status(report)

    workspace = await db.get(Workspace, meeting.workspace_id) if meeting.workspace_id else None
    document = await db.get(Document, report.document_id) if report.document_id else None
    session = (
        await db.get(MockChatSession, report.mock_session_id) if report.mock_session_id else None
    )

    return {
        "id": report.id,
        "title": short_title(
            (workspace.name if workspace else None)
            or (document.filename if document else None)
            or (session.title if session else None)
            or meeting.name
        ),
        "source": report.source,
        "status": display_status(generation_status, scores["official"] is not None),
        "generation_status": generation_status,
        "generation_error": (
            report.generation_error or "Quá thời gian tổng hợp, vui lòng thử lại."
            if generation_status == "failed"
            else None
        ),
        "created_at": _iso(report.created_at),
        "updated_at": _iso(report.updated_at),
        "meeting_id": meeting.id,
        "mock_session_id": report.mock_session_id,
        "workspace": {"id": workspace.id, "name": workspace.name} if workspace else None,
        "document": {"id": document.id, "filename": document.filename} if document else None,
        "rubric": rubric_view(rubric),
        "ai_review": review_view(report, rubric_cfg) if generation_status == "ready" else None,
        "scores": scores,
        "rules": rules,
        "verdict": compute_verdict(rules["rules"], scores["official"]),
        "transcript": report.transcript or [],
        "can_regenerate": (
            _is_owner_or_admin(user, meeting)
            and report.source == "ai_mock"
            and bool(report.transcript)
            and generation_status == "failed"
        ),
    }


@router.post("/{report_id}/regenerate", status_code=202)
async def regenerate_report(
    report_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Tổng hợp lại nhận xét AI (chỉ khi lần trước lỗi / quá hạn)."""
    report, meeting = await _load_report(db, report_id)
    if not _is_owner_or_admin(user, meeting):
        raise HTTPException(status_code=403, detail="Bạn không có quyền với báo cáo này")
    if report.source != "ai_mock" or not report.transcript:
        raise HTTPException(status_code=400, detail="Báo cáo này không có hội thoại để tổng hợp lại")
    if effective_generation_status(report) != "failed":
        raise HTTPException(status_code=409, detail="Báo cáo đang được tổng hợp hoặc đã có nhận xét")

    report.generation_status = "pending"
    report.generation_error = None
    report.updated_at = datetime.utcnow()
    await db.commit()
    await enqueue_report_generation(db, report)
    return {"report_id": report.id, "generation_status": report.generation_status}
