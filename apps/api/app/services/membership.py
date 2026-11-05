"""Gói hiện tại của user và quyền dùng tính năng theo gói.

Đây là nơi duy nhất quyết định "ai được dùng gì": API chặn bằng các hàm ở đây,
trang web đọc kết quả qua /api/payment/account. Đổi quy định chỉ cần sửa các hằng số dưới.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.booking import BookingStatus, MockBooking
from app.models.payment import Subscription
from app.models.subscription_plan import SubscriptionPlan
from app.models.user import User

# Link cũ và nút nâng cấp gọi gói bằng tên thay vì mã gói.
PLAN_ALIASES = {"free": "100001", "premium": "100002", "vip": "100003"}

PLAN_RANK = {"free": 0, "premium": 1, "vip": 2}

# Gói thấp nhất được dùng từng tính năng.
FEATURE_MIN_PLAN = {"mock_ai": "vip", "code_review": "premium", "rubric": "premium"}

FEATURE_LOCKED_MESSAGES = {
    "mock_ai": "Phòng Mock AI chỉ dành cho thành viên VIP. Hãy mua hoặc nâng cấp gói để sử dụng.",
    "code_review": "Phân tích code chỉ dành cho gói Premium trở lên. Hãy mua hoặc nâng cấp gói để sử dụng.",
    "rubric": "Đánh giá theo rubric chi tiết chỉ dành cho gói Premium trở lên. Hãy mua hoặc nâng cấp gói để sử dụng.",
}

# Tài khoản chưa có gói được đặt đúng 1 lịch Mock Room với mentor. Lịch bị từ chối hoặc đã huỷ không tính.
FREE_MENTOR_BOOKINGS = 1
USED_BOOKING_STATUSES = (BookingStatus.pending, BookingStatus.confirmed, BookingStatus.completed)
MENTOR_BOOKING_LOCKED_MESSAGE = (
    "Bạn đã dùng hết lượt đặt lịch Mock Room với mentor miễn phí. Hãy mua gói để đặt thêm."
)


def membership_key(plan: SubscriptionPlan) -> str:
    """Giá trị lưu ở profile_data.membership.plan: frontend và Mock AI so sánh với "vip" / "premium"."""
    name = plan.name.lower()
    if plan.slug == PLAN_ALIASES["vip"] or "vip" in name:
        return "vip"
    if plan.slug == PLAN_ALIASES["premium"] or "premium" in name:
        return "premium"
    return plan.slug


def membership_expired(membership: Dict[str, Any], now: datetime) -> bool:
    try:
        return datetime.fromisoformat(membership["expires_at"]) <= now
    except (KeyError, TypeError, ValueError):
        return False


def _plan_level(key: Optional[str]) -> str:
    """Gói admin tự tạo tính như Premium, giống cách frontend đang xử lý."""
    return "vip" if str(key).lower() in ("vip", "pro") else "premium"


def _profile_membership(user: User) -> Dict[str, Any]:
    profile = user.profile_data if isinstance(user.profile_data, dict) else {}
    membership = profile.get("membership")
    return membership if isinstance(membership, dict) else {}


def is_staff(user: User) -> bool:
    return any(role.name in ("admin", "mentor") for role in user.roles)


async def get_user_plan(db: AsyncSession, user: User) -> str:
    """Gói đang còn hạn: "free", "premium" hoặc "vip". Hết hạn là về "free"."""
    now = datetime.utcnow()
    stmt = (
        select(SubscriptionPlan)
        .join(Subscription, Subscription.plan_id == SubscriptionPlan.id)
        .where(
            Subscription.user_id == user.id,
            Subscription.status == "active",
            Subscription.expires_at > now,
        )
        .order_by(Subscription.expires_at.desc())
        .limit(1)
    )
    plan = (await db.execute(stmt)).scalars().first()
    if plan:
        return _plan_level(membership_key(plan))

    membership = _profile_membership(user)
    key = membership.get("plan")
    if membership.get("status") == "active" and key and key != "free" and not membership_expired(membership, now):
        return _plan_level(key)
    return "free"


async def _last_paid_plan_name(db: AsyncSession, user: User) -> Optional[str]:
    stmt = (
        select(SubscriptionPlan.name)
        .join(Subscription, Subscription.plan_id == SubscriptionPlan.id)
        .where(Subscription.user_id == user.id)
        .order_by(Subscription.id.desc())
        .limit(1)
    )
    name = (await db.execute(stmt)).scalars().first()
    if name:
        return name
    key = _profile_membership(user).get("plan")
    if key and key != "free":
        return "VIP" if _plan_level(key) == "vip" else "Premium"
    return None


async def has_feature(db: AsyncSession, user: User, feature: str) -> bool:
    if is_staff(user):
        return True
    return PLAN_RANK[await get_user_plan(db, user)] >= PLAN_RANK[FEATURE_MIN_PLAN[feature]]


def require_feature(feature: str):
    """Dependency chặn endpoint khi gói của user chưa được dùng tính năng này."""

    async def _check(
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        if not await has_feature(db, user, feature):
            raise HTTPException(status_code=403, detail=FEATURE_LOCKED_MESSAGES[feature])
        return user

    return _check


async def free_mentor_bookings_left(db: AsyncSession, user: User) -> int:
    used = (
        await db.execute(
            select(func.count(MockBooking.id)).where(
                MockBooking.student_id == user.id,
                MockBooking.status.in_(USED_BOOKING_STATUSES),
            )
        )
    ).scalar_one()
    return max(0, FREE_MENTOR_BOOKINGS - used)


async def can_book_mentor(db: AsyncSession, user: User) -> bool:
    if is_staff(user) or await get_user_plan(db, user) != "free":
        return True
    return await free_mentor_bookings_left(db, user) > 0


async def get_plan_access(db: AsyncSession, user: User) -> Dict[str, Any]:
    plan = await get_user_plan(db, user)
    staff = is_staff(user)
    bookings_left = await free_mentor_bookings_left(db, user)
    features = {
        feature: staff or PLAN_RANK[plan] >= PLAN_RANK[minimum]
        for feature, minimum in FEATURE_MIN_PLAN.items()
    }
    features["mentor_booking"] = staff or plan != "free" or bookings_left > 0
    return {
        "plan": plan,
        # Tên gói đã hết hạn, để báo "Gói VIP của bạn đã hết hạn" thay vì coi như chưa từng mua.
        "expired_plan": await _last_paid_plan_name(db, user) if plan == "free" else None,
        "features": features,
        "free_mentor_bookings_left": bookings_left,
    }
