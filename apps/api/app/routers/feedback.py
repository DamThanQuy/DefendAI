from __future__ import annotations

from collections import Counter
from datetime import datetime
import logging
from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.analysis_job import AnalysisJob
from app.models.assessment import CodeAnalysis, Evaluation, Report
from app.models.booking import MockBooking
from app.models.document import Document
from app.models.feedback import Feedback
from app.models.meeting import Meeting, MeetingMember
from app.models.payment import Subscription
from app.models.session import Session
from app.models.subscription_plan import SubscriptionPlan
from app.models.user import User
from app.models.workspace import Workspace
from app.models.workspace_question import WorkspaceQuestion
from app.models.workspace_chat import WorkspaceChat
from app.models.message import Message
from app.schemas.feedback import (
    AdoptionFunnelStats,
    CSATStats,
    FeedbackCreate,
    FeedbackListResponse,
    FeedbackResponse,
    FeedbackStatsResponse,
    FeedbackSubmitResult,
    FeedbackUserContextResponse,
    NPSStats,
    WillingnessToPayStats,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/feedback", tags=["Feedback"])


async def detect_user_plan(user: User, db: AsyncSession) -> str:
    """Xác định gói cước hiện tại của user."""
    now = datetime.utcnow()
    try:
        sub_stmt = (
            select(SubscriptionPlan.slug)
            .join(Subscription, Subscription.plan_id == SubscriptionPlan.id)
            .where(
                Subscription.user_id == user.id,
                Subscription.status == "active",
                Subscription.expires_at > now,
            )
            .order_by(Subscription.expires_at.desc())
        )
        slug = (await db.execute(sub_stmt)).scalar_one_or_none()
        if slug:
            return slug
    except Exception as exc:
        logger.warning("Error checking active subscription for user %s: %s", user.id, exc)

    if user.profile_data and isinstance(user.profile_data, dict):
        m = user.profile_data.get("membership", {})
        if isinstance(m, dict) and m.get("status") == "active":
            return m.get("plan", "free")

    return "free"


async def scan_user_features(user: User, db: AsyncSession) -> tuple[List[str], Dict[str, int]]:
    """Quét các bảng (workspaces, analysis, bookings, meetings, reports) của user."""
    counts: Dict[str, int] = {
        "workspaces": 0,
        "analysis": 0,
        "bookings": 0,
        "meetings": 0,
        "reports": 0,
    }

    # 1. workspaces: Yêu cầu đã thực sự tương tác AI (sinh câu hỏi phản biện hoặc chat hỏi đáp đề tài)
    try:
        q_cnt = (
            await db.execute(
                select(func.count(WorkspaceQuestion.id))
                .join(Workspace, WorkspaceQuestion.workspace_id == Workspace.id)
                .where(Workspace.user_id == user.id)
            )
        ).scalar() or 0
        msg_cnt = (
            await db.execute(
                select(func.count(Message.id))
                .join(Workspace, Message.workspace_id == Workspace.id)
                .where(Workspace.user_id == user.id)
            )
        ).scalar() or 0
        chat_cnt = (
            await db.execute(
                select(func.count(WorkspaceChat.id))
                .join(Workspace, WorkspaceChat.workspace_id == Workspace.id)
                .where(Workspace.user_id == user.id)
            )
        ).scalar() or 0
        counts["workspaces"] = q_cnt + msg_cnt + chat_cnt
    except Exception as exc:
        logger.warning("Error scanning workspace active interactions for user %s: %s", user.id, exc)

    # 2. analysis (AnalysisJob + CodeAnalysis)
    try:
        job_cnt = (
            await db.execute(
                select(func.count(AnalysisJob.id)).where(AnalysisJob.user_id == user.id)
            )
        ).scalar() or 0
        code_cnt = (
            await db.execute(
                select(func.count(CodeAnalysis.id))
                .join(Document, CodeAnalysis.document_id == Document.id)
                .where(Document.uploaded_by == user.id)
            )
        ).scalar() or 0
        counts["analysis"] = job_cnt + code_cnt
    except Exception as exc:
        logger.warning("Error scanning analysis for user %s: %s", user.id, exc)

    # 3. bookings
    try:
        booking_cnt = (
            await db.execute(
                select(func.count(MockBooking.id)).where(
                    or_(MockBooking.student_id == user.id, MockBooking.mentor_id == user.id)
                )
            )
        ).scalar() or 0
        counts["bookings"] = booking_cnt
    except Exception as exc:
        logger.warning("Error scanning bookings for user %s: %s", user.id, exc)

    # 4. meetings (mock booking meetings, member entries, sessions)
    try:
        meeting_cnt = (
            await db.execute(
                select(func.count(MockBooking.id)).where(
                    or_(MockBooking.student_id == user.id, MockBooking.mentor_id == user.id),
                    MockBooking.meeting_id.is_not(None),
                )
            )
        ).scalar() or 0

        session_cnt = (
            await db.execute(
                select(func.count(Session.id)).where(Session.created_by == user.id)
            )
        ).scalar() or 0

        counts["meetings"] = meeting_cnt + session_cnt
    except Exception as exc:
        logger.warning("Error scanning meetings for user %s: %s", user.id, exc)

    # 5. reports (evaluations with reports linked to user bookings/sessions)
    try:
        rep_from_booking = (
            await db.execute(
                select(func.count(Report.id))
                .join(Evaluation, Report.evaluation_id == Evaluation.id)
                .join(Meeting, Evaluation.meeting_id == Meeting.id)
                .join(MockBooking, MockBooking.meeting_id == Meeting.id)
                .where(
                    or_(MockBooking.student_id == user.id, MockBooking.mentor_id == user.id)
                )
            )
        ).scalar() or 0

        rep_from_session = (
            await db.execute(
                select(func.count(Report.id))
                .join(Evaluation, Report.evaluation_id == Evaluation.id)
                .join(Session, Evaluation.meeting_id == Session.id)
                .where(Session.created_by == user.id)
            )
        ).scalar() or 0

        counts["reports"] = rep_from_booking + rep_from_session
    except Exception as exc:
        logger.warning("Error scanning reports for user %s: %s", user.id, exc)

    detected: List[str] = [k for k, v in counts.items() if v > 0]
    return detected, counts


# ---------------------------------------------------------------------------
# 1. GET /api/feedback/user-context (alias: /context)
# ---------------------------------------------------------------------------
@router.get(
    "/user-context",
    response_model=FeedbackUserContextResponse,
    summary="Lấy thông tin ngữ cảnh người dùng phục vụ feedback",
)
@router.get(
    "/context",
    response_model=FeedbackUserContextResponse,
    include_in_schema=False,
)
async def get_user_feedback_context(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FeedbackUserContextResponse:
    """Tự động nhận diện current_plan, has_submitted, và quét các bảng
    (workspaces, analysis, bookings, meetings, reports) để trả về detected_features."""
    current_plan = await detect_user_plan(user, db)

    # Check has_submitted in feedbacks table & user profile
    fb_count = (
        await db.execute(
            select(func.count(Feedback.id)).where(Feedback.user_id == user.id)
        )
    ).scalar() or 0

    profile = user.profile_data if isinstance(user.profile_data, dict) else {}
    has_submitted = fb_count > 0 or bool(profile.get("feedback_status", {}).get("submitted"))

    raw_tickets = profile.get("mock_ai_trial_tickets", 0)
    try:
        mock_ai_trial_tickets = int(raw_tickets)
    except (ValueError, TypeError):
        mock_ai_trial_tickets = 0

    detected_features, feature_counts = await scan_user_features(user, db)
    eligible_for_feedback = len(detected_features) > 0 and not has_submitted

    return FeedbackUserContextResponse(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        current_plan=current_plan,
        has_submitted=has_submitted,
        detected_features=detected_features,
        feature_counts=feature_counts,
        mock_ai_trial_tickets=mock_ai_trial_tickets,
        eligible_for_feedback=eligible_for_feedback,
    )


# ---------------------------------------------------------------------------
# 2. POST /api/feedback (alias: /submit)
# ---------------------------------------------------------------------------
@router.post(
    "",
    response_model=FeedbackSubmitResult,
    status_code=status.HTTP_201_CREATED,
    summary="Gửi phản hồi và nhận vé trải nghiệm Mock Room AI",
)
@router.post(
    "/submit",
    response_model=FeedbackSubmitResult,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
async def submit_feedback(
    req: FeedbackCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FeedbackSubmitResult:
    """Lưu feedback, cộng thật user.profile_data['mock_ai_trial_tickets'] += 1 và commit."""
    # Experience Gate: Chặn người dùng chưa từng tương tác/sử dụng tính năng nào
    server_features, _ = await scan_user_features(user, db)
    if len(server_features) == 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn cần trải nghiệm và sử dụng ít nhất 1 tính năng (như hỏi đáp đề tài, sinh câu hỏi phản biện hoặc phân tích đồ án) trước khi gửi đánh giá.",
        )

    # Resolve current plan
    current_plan = req.current_plan or await detect_user_plan(user, db)

    # Normalize will_recommend (0-10)
    will_rec: Optional[int] = None
    if req.will_recommend is not None:
        if isinstance(req.will_recommend, bool):
            will_rec = 10 if req.will_recommend else 0
        else:
            try:
                parsed = int(req.will_recommend)
                will_rec = max(0, min(10, parsed))
            except (ValueError, TypeError):
                will_rec = None

    pay_will: Optional[str] = (
        str(req.pay_willingness).strip() if req.pay_willingness is not None else None
    )

    feedback = Feedback(
        user_id=user.id,
        current_plan=current_plan,
        overall_rating=req.overall_rating,
        aspect_ratings=req.aspect_ratings or {},
        detected_features=req.detected_features or [],
        feature_ratings=req.feature_ratings or {},
        low_rating_reasons=req.low_rating_reasons or [],
        best_thing=req.best_thing,
        suggested_change=req.suggested_change,
        will_recommend=will_rec,
        pay_willingness=pay_will,
        created_at=datetime.utcnow(),
    )
    db.add(feedback)

    # Atomic ticket granting: mock_ai_trial_tickets += 1
    profile = dict(user.profile_data or {})
    raw_tickets = profile.get("mock_ai_trial_tickets", 0)
    try:
        tickets = int(raw_tickets)
    except (ValueError, TypeError):
        tickets = 0
    new_tickets = tickets + 1

    profile["mock_ai_trial_tickets"] = new_tickets
    profile["feedback_status"] = {
        "submitted": True,
        "submitted_at": datetime.utcnow().isoformat(),
        "reward_ticket_granted": True,
    }
    user.profile_data = profile
    flag_modified(user, "profile_data")

    await db.commit()
    await db.refresh(feedback)
    await db.refresh(user)

    return FeedbackSubmitResult(
        success=True,
        feedback_id=feedback.id,
        mock_ai_trial_tickets=new_tickets,
        message="Cảm ơn bạn đã phản hồi! Bạn đã nhận được 01 vé trải nghiệm Mock Room AI.",
    )


# ---------------------------------------------------------------------------
# 3. GET /api/feedback (Admin: danh sách feedback)
# ---------------------------------------------------------------------------
@router.get(
    "",
    response_model=FeedbackListResponse,
    summary="Admin lấy danh sách phản hồi",
)
async def list_feedbacks(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    plan: Optional[str] = Query(None, description="Lọc theo gói cước"),
    rating: Optional[int] = Query(None, ge=1, le=5, description="Lọc theo mức sao"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin")),
) -> FeedbackListResponse:
    """Admin lấy danh sách feedback có phân trang và bộ lọc."""
    stmt = (
        select(Feedback, User.email, User.full_name)
        .outerjoin(User, Feedback.user_id == User.id)
    )
    count_stmt = select(func.count(Feedback.id))

    if plan:
        stmt = stmt.where(Feedback.current_plan == plan)
        count_stmt = count_stmt.where(Feedback.current_plan == plan)
    if rating:
        stmt = stmt.where(Feedback.overall_rating == rating)
        count_stmt = count_stmt.where(Feedback.overall_rating == rating)

    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(Feedback.created_at.desc()).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).all()

    items = [
        FeedbackResponse(
            id=fb.id,
            user_id=fb.user_id,
            user_email=email,
            user_name=full_name,
            current_plan=fb.current_plan,
            overall_rating=fb.overall_rating,
            aspect_ratings=fb.aspect_ratings,
            detected_features=fb.detected_features,
            feature_ratings=fb.feature_ratings,
            low_rating_reasons=fb.low_rating_reasons,
            best_thing=fb.best_thing,
            suggested_change=fb.suggested_change,
            will_recommend=fb.will_recommend,
            pay_willingness=fb.pay_willingness,
            created_at=fb.created_at,
        )
        for fb, email, full_name in rows
    ]

    return FeedbackListResponse(
        total=total,
        items=items,
        skip=skip,
        limit=limit,
    )


# ---------------------------------------------------------------------------
# 4. GET /api/feedback/stats (Admin: thống kê CSAT, NPS, Funnel, WTP)
# ---------------------------------------------------------------------------
@router.get(
    "/stats",
    response_model=FeedbackStatsResponse,
    summary="Admin lấy thống kê CSAT, NPS, Adoption Funnel, Willingness to Pay",
)
@router.get(
    "/analytics",
    response_model=FeedbackStatsResponse,
    include_in_schema=False,
)
async def get_feedback_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin")),
) -> FeedbackStatsResponse:
    """Admin lấy thống kê CSAT, NPS, Adoption Funnel, Willingness to Pay."""
    all_fb = (await db.execute(select(Feedback))).scalars().all()
    total_responses = len(all_fb)

    # 1. CSAT Calculation
    rating_dist = {str(i): 0 for i in range(1, 6)}
    total_stars = 0
    satisfied_count = 0
    low_reasons_counter: Counter[str] = Counter()

    for fb in all_fb:
        r = fb.overall_rating
        if 1 <= r <= 5:
            rating_dist[str(r)] += 1
            total_stars += r
            if r >= 4:
                satisfied_count += 1
            elif r <= 3 and fb.low_rating_reasons:
                reasons = (
                    fb.low_rating_reasons
                    if isinstance(fb.low_rating_reasons, list)
                    else [str(fb.low_rating_reasons)]
                )
                for reason in reasons:
                    if reason:
                        low_reasons_counter[str(reason)] += 1

    avg_csat = round(total_stars / total_responses, 2) if total_responses > 0 else 0.0
    satisfied_pct = (
        round((satisfied_count / total_responses) * 100, 1) if total_responses > 0 else 0.0
    )
    common_low_reasons = [
        {"reason": k, "count": v} for k, v in low_reasons_counter.most_common(10)
    ]

    csat_data = CSATStats(
        average_score=avg_csat,
        total_responses=total_responses,
        satisfied_count=satisfied_count,
        satisfied_percentage=satisfied_pct,
        rating_distribution=rating_dist,
        common_low_rating_reasons=common_low_reasons,
    )

    # 2. NPS Calculation
    nps_dist = {str(i): 0 for i in range(0, 11)}
    promoters_count = 0
    passives_count = 0
    detractors_count = 0
    total_nps = 0

    for fb in all_fb:
        if fb.will_recommend is not None:
            val = fb.will_recommend
            if 0 <= val <= 10:
                total_nps += 1
                nps_dist[str(val)] += 1
                if val >= 9:
                    promoters_count += 1
                elif val >= 7:
                    passives_count += 1
                else:
                    detractors_count += 1

    if total_nps > 0:
        promoter_pct = round((promoters_count / total_nps) * 100, 1)
        passive_pct = round((passives_count / total_nps) * 100, 1)
        detractor_pct = round((detractors_count / total_nps) * 100, 1)
        nps_score = round(promoter_pct - detractor_pct, 1)
    else:
        promoter_pct = passive_pct = detractor_pct = nps_score = 0.0

    nps_data = NPSStats(
        score=nps_score,
        promoters_count=promoters_count,
        passives_count=passives_count,
        detractors_count=detractors_count,
        promoters_percentage=promoter_pct,
        passives_percentage=passive_pct,
        detractors_percentage=detractor_pct,
        total_nps_responses=total_nps,
        distribution=nps_dist,
    )

    # 3. Adoption Funnel
    registered_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    workspaces_users = (
        await db.execute(select(func.count(func.distinct(Workspace.user_id))))
    ).scalar() or 0
    analysis_users = (
        await db.execute(select(func.count(func.distinct(AnalysisJob.user_id))))
    ).scalar() or 0
    bookings_users = (
        await db.execute(select(func.count(func.distinct(MockBooking.student_id))))
    ).scalar() or 0
    meetings_users = (
        await db.execute(
            select(func.count(func.distinct(MockBooking.student_id))).where(
                MockBooking.meeting_id.is_not(None)
            )
        )
    ).scalar() or 0

    reports_users = 0
    try:
        rep_stmt = (
            select(func.count(func.distinct(MockBooking.student_id)))
            .join(Meeting, MockBooking.meeting_id == Meeting.id)
            .join(Evaluation, Evaluation.meeting_id == Meeting.id)
            .join(Report, Report.evaluation_id == Evaluation.id)
        )
        reports_users = (await db.execute(rep_stmt)).scalar() or 0
    except Exception as exc:
        logger.warning("Error computing reports users in stats: %s", exc)

    feedback_users = (
        await db.execute(select(func.count(func.distinct(Feedback.user_id))))
    ).scalar() or 0

    base = registered_users if registered_users > 0 else 1
    funnel_pct = {
        "workspaces": round((workspaces_users / base) * 100, 1),
        "analysis": round((analysis_users / base) * 100, 1),
        "bookings": round((bookings_users / base) * 100, 1),
        "meetings": round((meetings_users / base) * 100, 1),
        "reports": round((reports_users / base) * 100, 1),
        "feedbacks": round((feedback_users / base) * 100, 1),
    }

    funnel_data = AdoptionFunnelStats(
        registered_users=registered_users,
        workspaces_users=workspaces_users,
        analysis_users=analysis_users,
        bookings_users=bookings_users,
        meetings_users=meetings_users,
        reports_users=reports_users,
        feedback_users=feedback_users,
        funnel_percentages=funnel_pct,
    )

    # 4. Willingness to Pay
    wtp_dist: Counter[str] = Counter()
    paid_count = 0
    free_count = 0
    total_wtp = 0

    for fb in all_fb:
        if fb.pay_willingness is not None:
            pw = str(fb.pay_willingness).strip()
            if pw:
                wtp_dist[pw] += 1
                total_wtp += 1
                is_free = pw.lower() in ["0", "0d", "0đ", "free", "miễn phí", "free plan"] or pw.startswith("0")
                if is_free:
                    free_count += 1
                else:
                    paid_count += 1

    paid_pct = round((paid_count / total_wtp) * 100, 1) if total_wtp > 0 else 0.0

    wtp_data = WillingnessToPayStats(
        distribution=dict(wtp_dist),
        paid_count=paid_count,
        free_count=free_count,
        paid_percentage=paid_pct,
        total_responses=total_wtp,
    )

    return FeedbackStatsResponse(
        csat=csat_data,
        nps=nps_data,
        adoption_funnel=funnel_data,
        willingness_to_pay=wtp_data,
    )
