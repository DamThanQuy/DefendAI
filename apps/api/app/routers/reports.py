from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from datetime import datetime

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.workspace import Workspace
from app.models.session import Session
from app.models.assessment import Assessment, AssessmentStatus, Evaluation, Report

router = APIRouter(prefix="/api/reports", tags=["reports"])
security = HTTPBearer()


@router.get("/my-reports")
async def get_my_reports(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """
    Get reports for current user's projects that meet both conditions:
    1. Project is uploaded to GraduAI (exists in workspaces)
    2. Project is in mockroom (exists in sessions with AI assessment)
    """
    user = get_current_user(credentials, db)

    # Get all workspaces created by user
    workspaces = db.query(Workspace).filter(Workspace.user_id == user.id).all()

    if not workspaces:
        return {
            "reports": [],
            "summary": {
                "total": 0,
                "completed": 0,
                "in_review": 0,
                "pending": 0
            }
        }

    # Get workspace IDs
    workspace_ids = [w.id for w in workspaces]

    # Get all sessions (mockrooms) created by user
    sessions = db.query(Session).filter(Session.created_by == user.id).all()

    # Get session IDs
    session_ids = [s.id for s in sessions]

    # Get assessments for AI mockrooms
    ai_assessments = db.query(Assessment).filter(
        Assessment.document_id.in_(session_ids),
        Assessment.status == AssessmentStatus.completed
    ).all()

    # Get completed evaluations and reports
    completed_evaluations = db.query(Evaluation).filter(
        Evaluation.id.in_([a.evaluation_id for a in ai_assessments if a.evaluation_id])
    ).all()

    # Get reports
    reports = db.query(Report).filter(
        Report.evaluation_id.in_([e.id for e in completed_evaluations])
    ).all()

    # Build report list with project info
    report_list = []
    for report in reports:
        evaluation = db.query(Evaluation).filter(Evaluation.id == report.evaluation_id).first()
        if not evaluation:
            continue

        # Find the session that this evaluation belongs to
        session = db.query(Session).filter(Session.id == evaluation.meeting_id).first()
        if not session:
            continue

        # Find the workspace that this session is based on
        # Assuming session.name contains workspace name or we need to link them
        workspace = db.query(Workspace).filter(
            Workspace.name == session.name,
            Workspace.user_id == user.id
        ).first()

        if not workspace:
            continue

        # Calculate AI score from evaluation
        scores = evaluation.scores if evaluation.scores else {}
        ai_score = scores.get("total", 0) if isinstance(scores, dict) else 0

        # Determine status based on report
        if report.pass_rate and report.pass_rate >= 70:
            status = "completed"
        elif report.pass_rate and report.pass_rate >= 40:
            status = "in_review"
        else:
            status = "pending"

        report_list.append({
            "id": report.id,
            "title": workspace.name,
            "description": "Dự án đã được đánh giá AI và phản biện từ mentor",
            "status": status,
            "ai_score": ai_score,
            "mentor_count": len(evaluation.scores) if evaluation.scores else 0,
            "created_at": report.created_at.isoformat() if report.created_at else None,
            "updated_at": report.created_at.isoformat() if report.created_at else None,
            "workspace_id": workspace.id,
            "session_id": session.id
        })

    # Calculate summary
    summary = {
        "total": len(report_list),
        "completed": len([r for r in report_list if r["status"] == "completed"]),
        "in_review": len([r for r in report_list if r["status"] == "in_review"]),
        "pending": len([r for r in report_list if r["status"] == "pending"])
    }

    # Calculate average AI score
    avg_score = sum(r["ai_score"] for r in report_list) / len(report_list) if report_list else 0

    return {
        "reports": report_list,
        "summary": {
            "total": summary["total"],
            "completed": summary["completed"],
            "in_review": summary["in_review"],
            "pending": summary["pending"],
            "average_score": round(avg_score, 1)
        }
    }
