"""
Payment router for PayOS, VietQR, and student subscription checkouts.
"""
from __future__ import annotations

import logging
import secrets
import time
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_optional_user
from app.models.user import User
from app.models.subscription_plan import SubscriptionPlan
from app.services.payos_service import payos_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/payment", tags=["Payment"])
security = HTTPBearer()

# In-memory store for active payment orders (order_code -> order_data)
# Used for quick status lookups and mock confirmations
ORDER_CACHE: Dict[int, Dict[str, Any]] = {}


class CreateOrderRequest(BaseModel):
    plan_id: str = Field(..., description="Mã gói: premium, vip, etc.")
    cycle: str = Field("monthly", description="Chu kỳ: monthly hoặc yearly")
    method: Optional[str] = Field("payos", description="Phương thức thanh toán: payos, momo, bank_transfer")
    return_url: Optional[str] = None
    cancel_url: Optional[str] = None


class WebhookPayload(BaseModel):
    code: str = "00"
    desc: str = "success"
    data: Dict[str, Any] = {}
    signature: str = ""


# Default prices fallback (VND)
PLAN_PRICES = {
    "free": {"monthly": 0, "yearly": 0, "name": "Free"},
    "100001": {"monthly": 0, "yearly": 0, "name": "Free"},
    "premium": {"monthly": 99000, "yearly": 990000, "name": "Premium"},
    "100002": {"monthly": 99000, yearly: 990000, "name": "Premium"},
    "vip": {"monthly": 199000, "yearly": 1990000, "name": "VIP"},
    "100003": {"monthly": 199000, "yearly": 1990000, "name": "VIP"},
}


@router.post("/create-order")
async def create_payment_order(
    req: CreateOrderRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Tạo đơn hàng thanh toán PayOS / VietQR cho gói hội viên của sinh viên."""

    raw_key = req.plan_id.lower().strip()
    if "vip" in raw_key or raw_key == "100003":
        plan_key = "vip"
    elif "free" in raw_key or raw_key == "100001":
        plan_key = "free"
    else:
        plan_key = "premium"

    cycle_key = req.cycle.lower().strip()

    # Determine amount
    amount = 0
    plan_name = plan_key.capitalize()

    # Try DB lookup first
    plan_stmt = select(SubscriptionPlan).where(
        (SubscriptionPlan.slug == raw_key)
        | (SubscriptionPlan.slug == plan_key)
        | (SubscriptionPlan.name.ilike(f"%{plan_key}%"))
    )
    plan_row = (await db.execute(plan_stmt)).scalar_one_or_none()

    if plan_row:
        plan_name = plan_row.name
        amount = plan_row.yearly if cycle_key == "yearly" else plan_row.monthly
    elif plan_key in PLAN_PRICES:
        plan_info = PLAN_PRICES[plan_key]
        plan_name = plan_info["name"]
        amount = plan_info["yearly"] if cycle_key == "yearly" else plan_info["monthly"]
    else:
        amount = 199000 if plan_key == "vip" else (99000 if cycle_key == "monthly" else 990000)
        plan_name = "VIP" if plan_key == "vip" else "Premium"

    if amount <= 0:
        # Free plan activation directly
        profile = dict(user.profile_data or {})
        profile["membership"] = {
            "plan": "free",
            "cycle": cycle_key,
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

    base_return = req.return_url or f"http://localhost:3000/payment-success?plan={plan_key}&cycle={cycle_key}&order_id={order_code}"
    base_cancel = req.cancel_url or f"http://localhost:3000/payment-cancel?plan={plan_key}&cycle={cycle_key}"

    # Call PayOS service
    payment_res = await payos_service.create_payment_link(
        order_code=order_code,
        amount=amount,
        description=description,
        return_url=base_return,
        cancel_url=base_cancel,
        method=req.method or "payos",
        items=[{
            "name": f"Gói {plan_name} ({cycle_key})",
            "quantity": 1,
            "price": amount
        }]
    )

    # Save to active order cache
    ORDER_CACHE[order_code] = {
        "order_code": order_code,
        "user_id": user.id,
        "user_email": user.email,
        "plan_id": plan_key,
        "plan_name": plan_name,
        "cycle": cycle_key,
        "amount": amount,
        "status": "PENDING",
        "created_at": datetime.utcnow().isoformat()
    }

    # Also record pending order in user profile
    profile = dict(user.profile_data or {})
    profile["last_order_code"] = order_code
    profile["pending_payment"] = {
        "order_code": order_code,
        "plan_id": plan_key,
        "cycle": cycle_key,
        "amount": amount,
        "status": "PENDING",
        "created_at": datetime.utcnow().isoformat()
    }
    user.profile_data = profile
    await db.commit()

    return {
        **payment_res,
        "plan": {
            "id": plan_key,
            "name": plan_name,
            "cycle": cycle_key
        }
    }


from app.models.payment import PaymentOrder, Subscription


async def apply_paid_membership(
    db: AsyncSession,
    user_id: Optional[int],
    plan_id: str,
    cycle: str,
    order_code: int,
    user: Optional[User] = None
) -> Dict[str, Any]:
    """Helper to activate membership in user profile and persist subscription row in database."""
    target_user = user
    if not target_user and user_id:
        target_user = await db.get(User, user_id)

    days = 365 if cycle == "yearly" else 30
    now = datetime.utcnow()
    expires_at = now + timedelta(days=days)

    membership_data = {
        "plan": plan_id,
        "cycle": cycle,
        "status": "active",
        "activated_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "order_code": order_code,
    }

    if target_user:
        profile = dict(target_user.profile_data or {})
        profile["membership"] = membership_data
        if "pending_payment" in profile:
            del profile["pending_payment"]
        target_user.profile_data = profile

        try:
            # Sync subscription row
            plan_stmt = select(SubscriptionPlan).where(
                (SubscriptionPlan.slug == plan_id) | (SubscriptionPlan.name.ilike(f"%{plan_id}%"))
            )
            plan_row = (await db.execute(plan_stmt)).scalar_one_or_none()
            if plan_row:
                # Expire previous subscriptions
                prev_sub_stmt = select(Subscription).where(
                    Subscription.user_id == target_user.id,
                    Subscription.status == "active"
                )
                for ps in (await db.execute(prev_sub_stmt)).scalars().all():
                    ps.status = "expired"

                # Check or create PaymentOrder
                po_stmt = select(PaymentOrder).where(PaymentOrder.order_code == str(order_code))
                po_row = (await db.execute(po_stmt)).scalar_one_or_none()
                po_id = po_row.id if po_row else None
                amount = plan_row.yearly if cycle == "yearly" else plan_row.monthly

                if not po_row:
                    po_row = PaymentOrder(
                        order_code=str(order_code),
                        user_id=target_user.id,
                        plan_id=plan_row.id,
                        purpose="subscription",
                        cycle=cycle,
                        amount=amount,
                        method="payos",
                        status="paid",
                        paid_at=now,
                    )
                    db.add(po_row)
                    await db.flush()
                    po_id = po_row.id
                else:
                    po_row.status = "paid"
                    po_row.paid_at = now

                sub = Subscription(
                    user_id=target_user.id,
                    plan_id=plan_row.id,
                    payment_order_id=po_id,
                    starts_at=now,
                    expires_at=expires_at,
                    status="active"
                )
                db.add(sub)
        except Exception as exc:
            logger.warning("Could not sync subscription row in DB: %s", exc)

        await db.commit()

    return membership_data


@router.get("/order-status/{order_code}")
async def check_order_status(
    order_code: int,
    user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Kiểm tra trạng thái thanh toán của đơn hàng theo orderCode."""

    order_info = ORDER_CACHE.get(order_code)
    current_status = order_info.get("status", "PENDING") if order_info else "PENDING"

    # Check PayOS upstream if configured and still pending
    if current_status == "PENDING" and payos_service.is_configured():
        payos_info = await payos_service.get_payment_link_information(order_code)
        if payos_info.get("status") == "PAID":
            current_status = "PAID"
            if order_info:
                order_info["status"] = "PAID"

    if current_status == "PAID":
        plan_id = order_info.get("plan_id", "premium") if order_info else "premium"
        cycle = order_info.get("cycle", "monthly") if order_info else "monthly"
        user_id = order_info.get("user_id") if order_info else (user.id if user else None)

        membership_data = await apply_paid_membership(
            db=db,
            user_id=user_id,
            plan_id=plan_id,
            cycle=cycle,
            order_code=order_code,
            user=user
        )

        return {
            "success": True,
            "status": "PAID",
            "orderCode": order_code,
            "message": "Thanh toán thành công! Tài khoản của bạn đã được nâng cấp.",
            "membership": membership_data
        }

    return {
        "success": True,
        "status": current_status,
        "orderCode": order_code,
        "message": "Đang chờ thanh toán"
    }


@router.post("/mock-confirm/{order_code}")
async def mock_confirm_payment(
    order_code: int,
    user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Xác nhận thanh toán thành công (dành cho chế độ Sandbox / Demo)."""

    order_info = ORDER_CACHE.get(order_code)
    plan_id = order_info.get("plan_id", "premium") if order_info else "premium"
    cycle = order_info.get("cycle", "monthly") if order_info else "monthly"
    user_id = order_info.get("user_id") if order_info else (user.id if user else None)

    if order_info:
        order_info["status"] = "PAID"

    membership_data = await apply_paid_membership(
        db=db,
        user_id=user_id,
        plan_id=plan_id,
        cycle=cycle,
        order_code=order_code,
        user=user
    )

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

    if not payos_service.verify_webhook_signature(payload.data, payload.signature):
        logger.warning("Invalid PayOS webhook signature received!")
        raise HTTPException(status_code=400, detail="Invalid signature")

    order_code = payload.data.get("orderCode")
    if not order_code:
        return {"success": False, "message": "Missing orderCode"}

    order_code_int = int(order_code)
    order_info = ORDER_CACHE.get(order_code_int)
    if order_info:
        order_info["status"] = "PAID"
        plan_id = order_info.get("plan_id", "premium")
        cycle = order_info.get("cycle", "monthly")
        user_id = order_info.get("user_id")
        await apply_paid_membership(
            db=db,
            user_id=user_id,
            plan_id=plan_id,
            cycle=cycle,
            order_code=order_code_int
        )
        logger.info("User %s upgraded to %s via PayOS Webhook.", user_id, plan_id)

    return {"success": True, "message": "Webhook processed successfully"}

