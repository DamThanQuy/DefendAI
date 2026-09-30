import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.mock_chat import MockChatMessage
from app.models.assessment import Assessment, AssessmentStatus, Evaluation, Report
from app.services.ai_client import ai_gateway

from app.models.meeting import Meeting, MeetingStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mock-ai", tags=["Mock AI"])


@router.post("/end-session")
async def end_mock_ai_session(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Kết thúc buổi Mock Room AI và tạo báo cáo đánh giá tổng quan.
    """
    # 1. Lấy lịch sử chat của user
    stmt = (
        select(MockChatMessage)
        .where(MockChatMessage.user_id == user.id)
        .order_by(MockChatMessage.id.asc())
    )
    result = await db.execute(stmt)
    chat_rows = result.scalars().all()

    # 2. Tạo meeting record cho phiên Mock AI
    meeting = Meeting(
        name=f"Mock AI — {user.full_name or user.username}",
        status=MeetingStatus.ended,
    )
    db.add(meeting)
    await db.flush()

    # 3. Tạo evaluation record
    evaluation = Evaluation(
        meeting_id=meeting.id,
        reviewer_name="Giám khảo AI",
        scores={
            "total": 85,
            "technical": 80,
            "presentation": 90,
            "problem_solving": 85,
            "communication": 82,
        },
        radar_data={
            "technical": 80,
            "presentation": 90,
            "problem_solving": 85,
            "communication": 82,
            "innovation": 78,
        },
        created_at=datetime.utcnow(),
    )
    db.add(evaluation)
    await db.flush()

    # 3. Tạo report record
    ai_feedback = "Buổi bảo vệ thử nghiệm (Mock AI) đã hoàn thành. Sinh viên đã trả lời các câu hỏi phản biện từ Giám khảo AI."
    if chat_rows:
        ai_feedback += f" Đã trao đổi {len(chat_rows)} lượt tin nhắn trong buổi chất vấn."

    report = Report(
        evaluation_id=evaluation.id,
        ai_feedback=ai_feedback,
        weaknesses=[
            "Cần chuẩn bị kỹ hơn phần kiến trúc và các trường hợp biên (edge cases)",
            "Nên giải thích rõ ràng hơn về lý do lựa chọn giải pháp kỹ thuật",
        ],
        pass_rate=85,
        created_at=datetime.utcnow(),
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    return {
        "success": True,
        "message": "Kết thúc buổi Mock AI thành công",
        "report_id": report.id,
        "evaluation_id": evaluation.id,
        "ai_score": 85,
    }

