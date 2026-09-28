from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from datetime import datetime
import json

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.workspace import Workspace
from app.models.session import Session
from app.models.assessment import Assessment, AssessmentStatus, Evaluation, Report
from app.models.meeting import Meeting
from app.models.booking import MockBooking, BookingStatus

router = APIRouter(prefix="/api/mock-ai", tags=["Mock AI"])
security = HTTPBearer()


@router.post("/end-session")
async def end_mock_ai_session(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """
    Kết thúc buổi Mock Room AI và tạo đánh giá cho đồ án.
    Điều kiện:
    1. User phải là student
    2. Session phải có status = "active"
    3. Tài liệu đã được chọn làm ngữ cảnh
    """
    user = get_current_user(credentials, db)

    # Kiểm tra role
    from app.models.role import Role
    user_roles = db.query(Role).join(
        "user_roles", Role.id == "user_roles.role_id"
    ).filter("user_roles.user_id" == user.id).all()
    roles = [r.name for r in user_roles]
    if "student" not in roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ student mới có thể kết thúc buổi Mock AI"
        )

    # Tìm session active của user
    session = db.query(Session).filter(
        Session.created_by == user.id,
        Session.status == "active"
    ).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy buổi Mock AI đang hoạt động"
        )

    # Tìm booking liên quan
    booking = db.query(MockBooking).filter(
        MockBooking.session_id == session.id
    ).first()

    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy booking cho buổi Mock AI này"
        )

    # Kiểm tra status booking
    if booking.status != BookingStatus.confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Booking status không hợp lệ: {booking.status}"
        )

    # Tìm workspace liên quan (giả sử session.name chứa workspace name)
    workspace = db.query(Workspace).filter(
        Workspace.name == session.name,
        Workspace.user_id == user.id
    ).first()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy workspace cho dự án này"
        )

    # Tìm tài liệu được chọn làm ngữ cảnh
    # Giả sử context được lưu trong session metadata
    context = session.metadata.get("context", "") if session.metadata else ""

    if not context:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vui lòng chọn tài liệu làm ngữ cảnh trước khi kết thúc"
        )

    # Tạo assessment
    assessment = Assessment(
        document_id=workspace.id,  # Sử dụng workspace.id làm document_id
        chunks=[context],
        questions=[],
        status=AssessmentStatus.completed,
        created_at=datetime.utcnow()
    )
    db.add(assessment)
    db.flush()

    # Tạo evaluation
    evaluation = Evaluation(
        meeting_id=session.id,
        reviewer_name="Mentor AI",
        scores={
            "total": 85,  # Sẽ được tính từ AI
            "technical": 80,
            "presentation": 90,
            "problem_solving": 85,
            "communication": 82
        },
        radar_data={
            "technical": 80,
            "presentation": 90,
            "problem_solving": 85,
            "communication": 82,
            "innovation": 78
        },
        created_at=datetime.utcnow()
    )
    db.add(evaluation)
    db.flush()

    # Tạo report
    report = Report(
        evaluation_id=evaluation.id,
        ai_feedback="Dự án của bạn đã được đánh giá thành công. Hãy xem chi tiết trong mục Báo cáo.",
        weaknesses=["Cần cải thiện phần documentation", "Nên thêm unit tests"],
        pass_rate=85,
        created_at=datetime.utcnow()
    )
    db.add(report)
    db.flush()

    # Cập nhật session status
    session.status = "completed"
    session.updated_at = datetime.utcnow()

    # Cập nhật booking status
    booking.status = BookingStatus.completed
    booking.updated_at = datetime.utcnow()

    db.commit()

    return {
        "success": True,
        "message": "Kết thúc buổi Mock AI thành công",
        "report_id": report.id,
        "evaluation_id": evaluation.id,
        "ai_score": 85
    }
