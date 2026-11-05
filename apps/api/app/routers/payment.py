"""
Payment router for PayOS, VietQR, and student subscription checkouts.

Giá chỉ lấy từ bảng subscription_plans và được chốt vào payment_orders lúc tạo đơn:
lúc kích hoạt, gói, chu kỳ và số tiền đều đọc từ đơn chứ không đọc lại bảng giá.
"""
from __future__ import annotations

import logging
import secrets
import time
from datetime import datetime, timedelta
from typing import Any, Dict, Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.subscription_plan import SubscriptionPlan
from app.routers.subscriptions import get_plans
from app.services.membership import PLAN_ALIASES, get_plan_access, membership_expired, membership_key
from app.services.payos_service import payos_service
from app.models.payment import PaymentOrder, Subscription, Wallet

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/payment", tags=["Payment"])
security = HTTPBearer()


class CreateOrderRequest(BaseModel):
    plan_id: str = Field(..., max_length=100, description="Mã gói, hoặc tên cũ: free, premium, vip")
    cycle: str = Field("monthly", pattern="^(monthly|yearly)$", description="Chu kỳ: monthly hoặc yearly")
    method: Optional[str] = Field("payos", max_length=30, description="Phương thức thanh toán: payos, momo, bank_transfer")
    return_url: Optional[str] = Field(None, max_length=500)
    cancel_url: Optional[str] = Field(None, max_length=500)


class WebhookPayload(BaseModel):
    code: str = "00"
    desc: str = "success"
    data: Dict[str, Any] = {}
    signature: str = ""


async def find_active_plan(db: AsyncSession, requested: str) -> SubscriptionPlan:
    """Mã gói lạ thì báo lỗi, không tự đổi sang gói khác."""
    key = requested.strip().lower()
    slug = PLAN_ALIASES.get(key, key)
    for plan in await get_plans(db, True):
        if plan.slug == slug or plan.name.lower() == key:
            return plan
    raise HTTPException(status_code=404, detail="Gói không tồn tại hoặc đã ngừng bán")


@router.post("/create-order")
async def create_payment_order(
    req: CreateOrderRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Tạo đơn hàng thanh toán PayOS / VietQR cho gói hội viên của sinh viên."""

    plan = await find_active_plan(db, req.plan_id)
    plan_key = membership_key(plan)
    amount = plan.yearly if req.cycle == "yearly" else plan.monthly

    if amount <= 0:
        # Free plan activation directly
        profile = dict(user.profile_data or {})
        profile["membership"] = {
            "plan": "free",
            "cycle": req.cycle,
            "status": "active",
            "updated_at": datetime.utcnow().isoformat()
        }
        user.profile_data = profile
        await db.commit()
        return {
            "success": True,
            "status": "PAID",
            "amount": 0,
            "message": "Gói miễn phí đã được kích hoạt thành công!"
        }

    # Generate unique numeric order code for PayOS (must be integer)
    order_code = int(time.time() % 10000000) * 100 + secrets.randbelow(100)
    description = f"DEFEND {order_code}"

    return_query = urlencode({"plan": plan_key, "plan_name": plan.name, "cycle": req.cycle, "order_id": order_code})
    cancel_query = urlencode({"plan": plan_key, "cycle": req.cycle})

    # Call PayOS service
    payment_res = await payos_service.create_payment_link(
        order_code=order_code,
        amount=amount,
        description=description,
        return_url=f"{req.return_url or settings.payos_return_url}?{return_query}",
        cancel_url=f"{req.cancel_url or settings.payos_cancel_url}?{cancel_query}",
        method=req.method or "payos",
        items=[{
            "name": f"Gói {plan.name} ({req.cycle})",
            "quantity": 1,
            "price": amount
        }]
    )

    db.add(PaymentOrder(
        order_code=str(order_code),
        user_id=user.id,
        plan_id=plan.id,
        purpose="subscription",
        cycle=req.cycle,
        amount=amount,
        method=req.method or "payos",
        status="pending",
        payment_url=payment_res.get("checkoutUrl"),
        qr_code=payment_res.get("qrCode") or None,
    ))
    await db.commit()

    return {
        **payment_res,
        "plan": {
            "id": plan_key,
            "name": plan.name,
            "cycle": req.cycle,
            "monthly": plan.monthly,
            "yearly": plan.yearly,
        }
    }


async def get_order(db: AsyncSession, order_code: int, for_update: bool = False) -> Optional[PaymentOrder]:
    stmt = select(PaymentOrder).where(
        PaymentOrder.order_code == str(order_code),
        PaymentOrder.purpose == "subscription",
    )
    if for_update:
        # populate_existing: sau khi chờ khoá phải đọc trạng thái mới nhất, không dùng bản đã đọc trước đó.
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    return (await db.execute(stmt)).scalar_one_or_none()


def amount_matches(order: PaymentOrder, paid_amount: Any) -> bool:
    try:
        return int(paid_amount) == order.amount
    except (TypeError, ValueError):
        return False


async def apply_paid_membership(db: AsyncSession, order: PaymentOrder) -> Dict[str, Any]:
    """Kích hoạt gói theo đúng đơn đã thanh toán (đơn phải đang được khoá).

    Đơn đã kích hoạt thì giữ nguyên: gọi lại không được gia hạn thêm.
    Mua tiếp cùng gói (vd từ tháng sang năm) thì thời gian còn lại được cộng thêm;
    đổi sang gói khác thì gói mới tính từ lúc thanh toán.
    """
    # Khoá user: thanh toán hai đơn cùng lúc vẫn cộng dồn đủ thời hạn của cả hai.
    target_user = await db.get(User, order.user_id, with_for_update=True, populate_existing=True)
    if order.status == "paid":
        membership = (target_user.profile_data or {}).get("membership") or {}
        await db.commit()
        return membership

    plan = await db.get(SubscriptionPlan, order.plan_id)
    now = datetime.utcnow()

    prev_sub_stmt = select(Subscription).where(
        Subscription.user_id == order.user_id,
        Subscription.status == "active"
    )
    previous_subs = (await db.execute(prev_sub_stmt)).scalars().all()
    paid_until = max((ps.expires_at for ps in previous_subs if ps.plan_id == plan.id), default=now)
    expires_at = max(paid_until, now) + timedelta(days=365 if order.cycle == "yearly" else 30)

    membership_data = {
        "plan": membership_key(plan),
        "cycle": order.cycle,
        "status": "active",
        "activated_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "order_code": int(order.order_code),
    }
    profile = dict(target_user.profile_data or {})
    profile["membership"] = membership_data
    target_user.profile_data = profile

    # Expire previous subscriptions
    for ps in previous_subs:
        ps.status = "expired"

    order.status = "paid"
    order.paid_at = now
    db.add(Subscription(
        user_id=order.user_id,
        plan_id=plan.id,
        payment_order_id=order.id,
        starts_at=now,
        expires_at=expires_at,
        status="active"
    ))
    await db.commit()

    return membership_data


@router.get("/order-status/{order_code}")
async def check_order_status(
    order_code: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Kiểm tra trạng thái đơn của chính người dùng; PayOS báo đã trả thì kích hoạt gói."""

    order = await get_order(db, order_code)
    if not order or order.user_id != user.id:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng")

    current_status = "PAID" if order.status == "paid" else "PENDING"

    # Check PayOS upstream if configured and still pending
    if current_status == "PENDING" and payos_service.is_configured():
        payos_info = await payos_service.get_payment_link_information(order_code)
        payos_status = payos_info.get("status")
        if payos_status == "PAID":
            if amount_matches(order, payos_info.get("amount")):
                current_status = "PAID"
            else:
                logger.error("PayOS amount %s differs from order %s", payos_info.get("amount"), order_code)
        elif payos_status in ("CANCELLED", "EXPIRED"):
            current_status = payos_status

    if current_status == "PAID":
        membership_data = await apply_paid_membership(db, await get_order(db, order_code, for_update=True))
        return {
            "success": True,
            "status": "PAID",
            "orderCode": order_code,
            "message": "Thanh toán thành công! Tài khoản của bạn đã được nâng cấp.",
            "membership": membership_data
        }

    messages = {"CANCELLED": "Đơn hàng đã bị hủy", "EXPIRED": "Đơn hàng đã hết hạn"}
    return {
        "success": True,
        "status": current_status,
        "orderCode": order_code,
        "message": messages.get(current_status, "Đang chờ thanh toán")
    }


@router.post("/mock-confirm/{order_code}")
async def mock_confirm_payment(
    order_code: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Xác nhận thanh toán thành công (dành cho chế độ Sandbox / Demo), chỉ với đơn của chính người dùng."""

    order = await get_order(db, order_code, for_update=True)
    if not order or order.user_id != user.id:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng")

    membership_data = await apply_paid_membership(db, order)

    return {
        "success": True,
        "status": "PAID",
        "orderCode": order_code,
        "message": "Thanh toán thành công! Gói hội viên đã kích hoạt.",
        "membership": membership_data
    }


@router.post("/webhook")
async def payos_webhook(
    payload: WebhookPayload,
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Nhận IPN Webhook từ PayOS khi khách hàng hoàn tất thanh toán."""
    logger.info("Received PayOS Webhook: %s", payload)

    if not payos_service.is_configured():
        raise HTTPException(status_code=503, detail="PayOS chưa được cấu hình")

    if not payos_service.verify_webhook_signature(payload.data, payload.signature):
        logger.warning("Invalid PayOS webhook signature received!")
        raise HTTPException(status_code=400, detail="Invalid signature")

    if payload.code != "00":
        return {"success": True, "message": "Ignored unsuccessful payment"}

    try:
        order_code = int(payload.data.get("orderCode"))
    except (TypeError, ValueError):
        return {"success": False, "message": "Missing orderCode"}

    order = await get_order(db, order_code, for_update=True)
    if not order:
        logger.warning("PayOS webhook for unknown order %s", order_code)
        return {"success": True, "message": "Unknown order ignored"}

    if not amount_matches(order, payload.data.get("amount")):
        logger.error("PayOS webhook amount %s differs from order %s", payload.data.get("amount"), order_code)
        return {"success": False, "message": "Amount mismatch"}

    await apply_paid_membership(db, order)
    logger.info("User %s activated order %s via PayOS Webhook.", order.user_id, order_code)

    return {"success": True, "message": "Webhook processed successfully"}


@router.get("/account")
async def get_payment_account(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Lấy thông tin tài khoản thanh toán, số dư ví và gói hội viên hiện tại."""
    now = datetime.utcnow()
    stmt = (
        select(Subscription, SubscriptionPlan, PaymentOrder.cycle)
        .join(SubscriptionPlan, Subscription.plan_id == SubscriptionPlan.id)
        .join(PaymentOrder, Subscription.payment_order_id == PaymentOrder.id)
        .where(
            Subscription.user_id == user.id,
            Subscription.status == "active",
            Subscription.expires_at > now,
        )
        .order_by(Subscription.expires_at.desc())
    )
    res = (await db.execute(stmt)).first()

    sub_data = None
    if res:
        sub, plan, cycle = res
        sub_data = {
            "plan_id": plan.slug or str(plan.id),
            "plan_name": plan.name,
            "cycle": cycle,
            "starts_at": sub.starts_at.isoformat() if sub.starts_at else None,
            "expires_at": sub.expires_at.isoformat() if sub.expires_at else None,
            "features": plan.features or [],
        }
    elif user.profile_data and isinstance(user.profile_data, dict) and user.profile_data.get("membership"):
        m = user.profile_data.get("membership", {})
        p_key = m.get("plan") or "free"
        # Gói free không phải subscription trả phí: không suy diễn thành VIP/Premium.
        if m.get("status") == "active" and p_key != "free" and not membership_expired(m, now):
            sub_data = {
                "plan_id": p_key,
                "plan_name": "VIP" if "vip" in p_key.lower() else "Premium",
                "cycle": m.get("cycle"),
                "starts_at": m.get("activated_at", now.isoformat()),
                "expires_at": m.get("expires_at", (now + timedelta(days=365)).isoformat()),
                "features": [],
            }

    balance = 0
    try:
        wallet_stmt = select(Wallet).where(Wallet.user_id == user.id)
        wallet = (await db.execute(wallet_stmt)).scalar_one_or_none()
        if wallet:
            balance = wallet.balance
    except Exception:
        pass

    return {
        "wallet": {"balance": balance, "currency": "VND"},
        "subscription": sub_data,
        "access": await get_plan_access(db, user),
    }

