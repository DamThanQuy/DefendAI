"""Upload quota theo gói cước (Free = 3 đồ án/tháng)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.payment import Subscription
from app.models.subscription_plan import SubscriptionPlan
from app.models.user import User

VN_TZ = timezone(timedelta(hours=7))

# Hạn mức mặc định khi không tìm thấy gói trong DB (user free chưa có subscription row).
FREE_DEFAULT_MONTHLY_UPLOADS = 3


def _month_start_utc() -> datetime:
    """Đầu tháng hiện tại theo giờ Việt Nam, quy về UTC để so với created_at."""
    now_vn = datetime.now(VN_TZ)
    start_vn = now_vn.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return start_vn.astimezone(timezone.utc).replace(tzinfo=None)


async def resolve_plan_slug(user: User, db: AsyncSession) -> str:
    """Xác định slug gói hiện tại của user (active subscription, fallback profile, mặc định free)."""
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
    except Exception:
        pass

    if user.profile_data and isinstance(user.profile_data, dict):
        m = user.profile_data.get("membership", {})
        if isinstance(m, dict) and m.get("status") == "active":
            return m.get("plan", "free")
    return "free"


async def get_monthly_upload_quota(user: User, db: AsyncSession) -> dict:
    """Trả về hạn mức upload trong tháng: {limit, used, remaining, plan}.

    limit None = không giới hạn (Premium/VIP). Đếm chỉ Document chưa xoá
    (deleted_at IS NULL) tạo từ đầu tháng đến giờ.
    """
    plan = await resolve_plan_slug(user, db)

    # (limit, id) — phân biệt "plan không tồn tại trong DB" với "plan tồn tại
    # nhưng max_documents_per_month = NULL (không giới hạn)".
    plan_row = (
        await db.execute(
            select(SubscriptionPlan.max_documents_per_month, SubscriptionPlan.id)
            .where(SubscriptionPlan.slug == plan)
        )
    ).first()
    if plan_row is None:
        # Plan không có trong DB (vd user free chưa có subscription row) →
        # áp dụng hạn mức free mặc định.
        limit: int | None = FREE_DEFAULT_MONTHLY_UPLOADS
    else:
        limit = plan_row[0]

    used_stmt = (
        select(func.count(Document.id))
        .where(
            Document.uploaded_by == user.id,
            Document.deleted_at.is_(None),
            Document.created_at >= _month_start_utc(),
        )
    )
    used = (await db.execute(used_stmt)).scalar() or 0

    remaining = None if limit is None else max(limit - used, 0)
    return {"limit": limit, "used": used, "remaining": remaining, "plan": plan}


async def assert_upload_quota(user: User, db: AsyncSession) -> None:
    """Chặn upload khi user gói Free đã hết lượt trong tháng."""
    quota = await get_monthly_upload_quota(user, db)
    limit = quota["limit"]
    if limit is not None and quota["used"] >= limit:
        raise HTTPException(
            status_code=402,
            detail=(
                f"Bạn đã hết lượt upload đồ án trong tháng này (tối đa {limit} lượt). "
                "Nâng cấp gói Premium để upload không giới hạn."
            ),
        )
