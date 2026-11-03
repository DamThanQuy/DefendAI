"""Kết thúc buổi Mock Room AI → tạo báo cáo cho sinh viên.

1 phiên chat (mock_chat_sessions) = 1 báo cáo: snapshot hội thoại vào reports,
worker gọi AI tổng hợp nhận xét định tính theo rubric (job 'mock_report').
KHÔNG chấm điểm số — điểm OGA/TDA chỉ đến từ DefenseScore do mentor/admin chấm.
"""
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.assessment import Evaluation, Report
from app.models.meeting import Meeting, MeetingStatus
from app.models.mock_chat import MockChatMessage, MockChatSession
from app.models.user import User
from app.services.mock_report import enqueue_report_generation, resolve_workspace_for_document
from app.services.report_builder import (
    build_transcript,
    effective_generation_status,
    has_student_answer,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mock-ai", tags=["Mock AI"])


class EndSessionRequest(BaseModel):
    session_id: int = Field(..., description="Phiên chat Mock AI cần chốt báo cáo")


def _end_response(report: Report, generation_status: str) -> dict:
    return {
        "success": True,
        "message": "Đã kết thúc buổi Mock AI, báo cáo đang được tổng hợp"
        if generation_status == "pending"
        else "Đã kết thúc buổi Mock AI",
        "report_id": report.id,
        "generation_status": generation_status,
    }


async def _session_report(db: AsyncSession, session_id: int) -> Report | None:
    result = await db.execute(select(Report).where(Report.mock_session_id == session_id))
    return result.scalar_one_or_none()


@router.post("/end-session", status_code=202)
async def end_mock_ai_session(
    body: EndSessionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Kết thúc buổi Mock Room AI và tạo (hoặc cập nhật) báo cáo của phiên."""
    session = (
        await db.execute(
            select(MockChatSession).where(
                MockChatSession.id == body.session_id,
                MockChatSession.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên chat")

    messages = (
        await db.execute(
            select(MockChatMessage)
            .where(MockChatMessage.session_id == session.id)
            .order_by(MockChatMessage.id.asc())
        )
    ).scalars().all()
    transcript = build_transcript(messages)
    if not has_student_answer(transcript):
        raise HTTPException(
            status_code=400,
            detail="Phiên chưa có câu trả lời nào của sinh viên để đánh giá",
        )

    workspace_id = await resolve_workspace_for_document(db, user.id, session.document_id)
    now = datetime.utcnow()
    report = await _session_report(db, session.id)

    if report is not None:
        generation_status = effective_generation_status(report, now)
        # Đang tổng hợp, hoặc đã có báo cáo cho đúng hội thoại này → không tạo job trùng
        if generation_status == "pending" or (
            generation_status == "ready" and report.transcript == transcript
        ):
            return _end_response(report, generation_status)
        evaluation = await db.get(Evaluation, report.evaluation_id)
        meeting = await db.get(Meeting, evaluation.meeting_id) if evaluation else None
        if meeting is not None:
            meeting.workspace_id = workspace_id
        report.transcript = transcript
        report.document_id = session.document_id
        report.generation_status = "pending"
        report.generation_error = None
        report.updated_at = now
    else:
        meeting = Meeting(
            name=f"Mock AI — {session.title}"[:255],
            status=MeetingStatus.ended,
            student_id=user.id,
            workspace_id=workspace_id,
        )
        db.add(meeting)
        await db.flush()
        evaluation = Evaluation(meeting_id=meeting.id, reviewer_name="Giám khảo AI", scores={})
        db.add(evaluation)
        await db.flush()
        report = Report(
            evaluation_id=evaluation.id,
            source="ai_mock",
            generation_status="pending",
            mock_session_id=session.id,
            document_id=session.document_id,
            transcript=transcript,
            created_at=now,
            updated_at=now,
        )
        db.add(report)

    try:
        await db.commit()
    except IntegrityError:
        # Bấm kết thúc 2 lần song song: request kia đã tạo report cho phiên này
        await db.rollback()
        report = await _session_report(db, session.id)
        if report is None:
            raise
        return _end_response(report, effective_generation_status(report))

    await enqueue_report_generation(db, report)
    return _end_response(report, report.generation_status)
