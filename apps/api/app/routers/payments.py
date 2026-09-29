"""Manual QR/VietQR payments, wallet purchases and subscription entitlement."""
from datetime import datetime, timedelta
import hashlib
import hmac
import math
import os
import secrets
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.core.deps import get_current_user, require_role
from app.models.payment import PaymentOrder, Subscription, Wallet, WalletTransaction
from app.models.subscription_plan import SubscriptionPlan
from app.models.user import User

router = APIRouter(prefix="/api/payment", tags=["Payments"])
admin_router = APIRouter(prefix="/api/admin/payments", tags=["Admin payments"])

METHODS = {"vietqr", "payos", "wallet"}


class CreateOrderPayload(BaseModel):
    plan_id: str | None = Field(None, min_length=1, max_length=50)
    cycle: str = Field("monthly", pattern="^(monthly|yearly)$")
    method: str = Field(..., pattern="^(vietqr|payos|wallet)$")
    purpose: str = Field("subscription", pattern="^(subscription|wallet)$")
    amount: int | None = Field(None, ge=1000, le=50_000_000)


class ConfirmPayload(BaseModel):
    provider_reference: str | None = Field(None, max_length=255)


def serialize_order(order: PaymentOrder, plan: SubscriptionPlan | None = None, wallet: Wallet | None = None) -> dict:
    return {
        "id": order.id,
        "order_code": order.order_code,
        "plan_id": plan.slug if plan else None,
        "plan_name": plan.name if plan else None,
        "cycle": order.cycle,
        "amount": order.amount,
        "proration_credit": order.proration_credit,
        "method": order.method,
        "purpose": order.purpose,
        "status": order.status,
        "provider_reference": order.provider_reference,
        "payment_url": order.payment_url,
        "qr_code": order.qr_code,
        "created_at": order.created_at.isoformat(),
        "paid_at": order.paid_at.isoformat() if order.paid_at else None,
        "payment_instructions": payment_instructions(order, wallet),
    }


def payment_instructions(order: PaymentOrder, wallet: Wallet | None = None) -> dict:
    if order.method == "wallet":
        return {"type": "wallet", "balance": wallet.balance if wallet else 0}
    if order.method == "payos":
        qr_url = (
            f"https://quickchart.io/qr?size=320&text={quote(order.qr_code or '')}"
            if order.qr_code
            else None
        )
        return {
            "type": "payos",
            "qr_url": qr_url,
            "qr_code": order.qr_code,
            "payment_url": order.payment_url,
            "note": "Thanh toán qua PayOS. Hệ thống tự động xác nhận sau khi giao dịch thành công.",
        }
    bank = os.getenv("PAYMENT_BANK_CODE", "VCB")
    account = os.getenv("PAYMENT_BANK_ACCOUNT", "0123456789")
    account_name = os.getenv("PAYMENT_BANK_ACCOUNT_NAME", "DEFENDAI")
    transfer_text = order.order_code
    qr_url = os.getenv("PAYMENT_MANUAL_QR_URL", "") if order.method == "manual_qr" else ""
    if not qr_url:
        qr_url = (
            f"https://img.vietqr.io/image/{bank}-{account}-compact2.png"
            f"?amount={order.amount}&addInfo={transfer_text}&accountName={account_name}"
        )
    return {
        "type": "qr" if order.method == "manual_qr" else "vietqr",
        "qr_url": qr_url,
        "bank_code": bank,
        "account_number": account,
        "account_name": account_name,
        "transfer_content": transfer_text,
        "note": "Chỉ được xác nhận sau khi hệ thống hoặc admin kiểm tra giao dịch thực tế.",
    }


def payos_signature(payload: dict, checksum_key: str) -> str:
    signing_data = "&".join(
        f"{key}={payload[key]}" for key in sorted(payload) if payload[key] is not None
    )
    return hmac.new(checksum_key.encode(), signing_data.encode(), hashlib.sha256).hexdigest()


async def create_payos_payment(order: PaymentOrder) -> dict:
    client_id = settings.payos_client_id
    api_key = settings.payos_api_key
    checksum_key = settings.payos_checksum_key
    if not client_id or not api_key or not checksum_key:
        raise HTTPException(status_code=503, detail="PayOS chưa được cấu hình")

    payment_data = {
        "orderCode": order.id,
        "amount": order.amount,
        # PayOS limits descriptions to 9 characters for non-linked banks.
        "description": str(order.id),
        "cancelUrl": settings.payos_cancel_url,
        "returnUrl": settings.payos_return_url,
    }
    payment_data["signature"] = payos_signature(
        {
            "amount": order.amount,
            "cancelUrl": payment_data["cancelUrl"],
            "description": str(order.id),
            "orderCode": order.id,
            "returnUrl": payment_data["returnUrl"],
        },
        checksum_key,
    )
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            "https://api-merchant.payos.vn/v2/payment-requests",
            headers={"x-client-id": client_id, "x-api-key": api_key},
            json=payment_data,
        )
    result = response.json()
    if response.status_code >= 400 or result.get("code") != "00" or not result.get("data"):
        detail = result.get("desc", "Không tạo được link PayOS")
        raise HTTPException(status_code=502, detail=f"PayOS ({result.get('code', response.status_code)}): {detail}")
    return result["data"]


async def reconcile_payos_order(db: AsyncSession, order: PaymentOrder) -> None:
    if order.method != "payos" or order.status == "paid":
        return

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"https://api-merchant.payos.vn/v2/payment-requests/{order.id}",
                headers={
                    "x-client-id": settings.payos_client_id,
                    "x-api-key": settings.payos_api_key,
                },
            )
        result = response.json()
    except (httpx.HTTPError, ValueError):
        return

    payment = result.get("data") or {}
    if response.status_code >= 400 or result.get("code") != "00" or payment.get("status") != "PAID":
        return

    await settle_order(
        db,
        order,
        str(payment.get("paymentLinkId") or payment.get("orderCode") or order.id),
    )
    await db.commit()
    await db.refresh(order)


async def find_plan(db: AsyncSession, plan_id: str) -> SubscriptionPlan:
    plan = (await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.slug == plan_id, SubscriptionPlan.active.is_(True)))).scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Gói subscription không tồn tại hoặc đã tắt")
    return plan


async def get_or_create_wallet(db: AsyncSession, user_id: int) -> Wallet:
    wallet = (await db.execute(select(Wallet).where(Wallet.user_id == user_id).with_for_update())).scalar_one_or_none()
    if not wallet:
        wallet = Wallet(user_id=user_id, balance=0)
        db.add(wallet)
        await db.flush()
    return wallet


async def activate_subscription(db: AsyncSession, order: PaymentOrder, plan: SubscriptionPlan) -> Subscription:
    now = datetime.utcnow()
    current = (await db.execute(select(Subscription).where(Subscription.user_id == order.user_id, Subscription.status == "active", Subscription.expires_at > now).order_by(Subscription.expires_at.desc()).with_for_update())).scalars().first()
    starts_at = now if order.proration_credit else (current.expires_at if current and current.expires_at > now else now)
    expires_at = starts_at + (timedelta(days=365) if order.cycle == "yearly" else timedelta(days=30))
    if current:
        current.status = "superseded"
    subscription = Subscription(user_id=order.user_id, plan_id=plan.id, payment_order_id=order.id, starts_at=starts_at, expires_at=expires_at, status="active")
    db.add(subscription)
    return subscription


async def settle_order(db: AsyncSession, order: PaymentOrder, provider_reference: str | None = None) -> None:
    if order.status == "paid":
        return
    order.status = "paid"
    order.paid_at = datetime.utcnow()
    order.provider_reference = provider_reference
    if order.purpose == "wallet":
        wallet = await get_or_create_wallet(db, order.user_id)
        before = wallet.balance
        wallet.balance += order.amount
        db.add(WalletTransaction(wallet_id=wallet.id, type="deposit", amount=order.amount, balance_before=before, balance_after=wallet.balance, reference_type="payment_order", reference_id=order.order_code))
    else:
        plan = await db.get(SubscriptionPlan, order.plan_id)
        if not plan:
            raise HTTPException(status_code=409, detail="Gói của đơn hàng không còn tồn tại")
        await activate_subscription(db, order, plan)


@router.post("/create-order")
async def create_order(req: CreateOrderPayload, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    if req.purpose == "subscription" and not req.plan_id:
        raise HTTPException(status_code=422, detail="plan_id là bắt buộc khi mua gói")
    plan = await find_plan(db, req.plan_id) if req.plan_id else None
    proration_credit = 0
    if req.purpose == "subscription":
        amount = plan.monthly if req.cycle == "monthly" else plan.yearly
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Gói miễn phí không cần thanh toán")
        current_row = (await db.execute(
            select(Subscription, SubscriptionPlan, PaymentOrder)
            .join(SubscriptionPlan, Subscription.plan_id == SubscriptionPlan.id)
            .outerjoin(PaymentOrder, PaymentOrder.id == Subscription.payment_order_id)
            .where(
                Subscription.user_id == user.id,
                Subscription.status == "active",
                Subscription.expires_at > datetime.utcnow(),
            )
            .order_by(Subscription.expires_at.desc())
        )).first()
        if current_row:
            current_subscription, current_plan, current_order = current_row
            if plan.monthly > current_plan.monthly:
                old_cycle = current_order.cycle if current_order else "monthly"
                old_price = current_plan.yearly if old_cycle == "yearly" else current_plan.monthly
                period_days = 365 if old_cycle == "yearly" else 30
                remaining_days = max(0, math.ceil((current_subscription.expires_at - datetime.utcnow()).total_seconds() / 86400))
                proration_credit = math.floor(old_price * remaining_days / period_days)
                amount = max(0, amount - proration_credit)
    else:
        amount = req.amount or 0
        if amount < 10_000:
            raise HTTPException(status_code=422, detail="Số tiền nạp tối thiểu là 10.000 VND")
    order = PaymentOrder(order_code=f"DEF{datetime.utcnow():%y%m%d%H%M%S}{secrets.token_hex(2).upper()}", user_id=user.id, plan_id=plan.id if plan else None, cycle=req.cycle, amount=amount, proration_credit=proration_credit, method=req.method, purpose=req.purpose, status="pending")
    db.add(order)
    await db.flush()
    if req.method == "payos" and amount > 0:
        try:
            payos_data = await create_payos_payment(order)
        except Exception:
            await db.rollback()
            raise
        order.payment_url = payos_data.get("checkoutUrl")
        order.qr_code = payos_data.get("qrCode")
        order.provider_reference = payos_data.get("paymentLinkId")
    if req.method == "wallet":
        wallet = await get_or_create_wallet(db, user.id)
        if wallet.balance < amount:
            await db.rollback()
            raise HTTPException(status_code=400, detail="Số dư ví không đủ")
        before = wallet.balance
        wallet.balance -= amount
        order.status = "paid"
        order.paid_at = datetime.utcnow()
        db.add(WalletTransaction(wallet_id=wallet.id, type="purchase", amount=-amount, balance_before=before, balance_after=wallet.balance, reference_type="payment_order", reference_id=order.order_code))
        if plan:
            await activate_subscription(db, order, plan)
    if req.purpose == "subscription" and amount == 0:
        order.status = "paid"
        order.paid_at = datetime.utcnow()
        if plan:
            await activate_subscription(db, order, plan)
    await db.commit()
    await db.refresh(order)
    wallet = await db.get(Wallet, user.id)
    return {"success": True, "order": serialize_order(order, plan, wallet)}


@router.get("/orders/{order_code}")
async def get_order(order_code: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    order = (await db.execute(select(PaymentOrder).where(PaymentOrder.order_code == order_code, PaymentOrder.user_id == user.id))).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng")
    await reconcile_payos_order(db, order)
    plan = await db.get(SubscriptionPlan, order.plan_id) if order.plan_id else None
    wallet = await db.get(Wallet, user.id)
    return {"order": serialize_order(order, plan, wallet)}


@router.post("/orders/{order_code}/submitted")
async def submit_manual_payment(order_code: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    order = (await db.execute(select(PaymentOrder).where(PaymentOrder.order_code == order_code, PaymentOrder.user_id == user.id))).scalar_one_or_none()
    if not order or order.method not in {"manual_qr", "vietqr"}:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn thủ công")
    if order.status == "pending":
        order.status = "awaiting_review"
        await db.commit()
    return {"success": True, "status": order.status, "message": "Đã ghi nhận yêu cầu, chờ xác nhận giao dịch."}


@router.post("/webhook/payos")
async def payos_webhook(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    checksum_key = settings.payos_checksum_key
    if not checksum_key:
        raise HTTPException(status_code=503, detail="PayOS chưa được cấu hình")
    try:
        payload = await request.json()
        data = payload.get("data") or {}
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Payload PayOS không hợp lệ") from error

    received_signature = payload.get("signature")
    if not received_signature or not hmac.compare_digest(
        received_signature, payos_signature(data, checksum_key)
    ):
        raise HTTPException(status_code=401, detail="Chữ ký webhook PayOS không hợp lệ")
    if payload.get("success") is False or payload.get("code") not in {None, "00"}:
        return {"success": True, "ignored": True}

    try:
        payos_order_id = int(data["orderCode"])
        paid_amount = int(data["amount"])
    except (KeyError, TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail="Thiếu orderCode hoặc amount của PayOS") from error

    order = (await db.execute(select(PaymentOrder).where(PaymentOrder.id == payos_order_id).with_for_update())).scalar_one_or_none()
    if not order or order.method != "payos":
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn PayOS")
    if order.amount != paid_amount:
        raise HTTPException(status_code=409, detail="Số tiền PayOS không khớp đơn hàng")
    if order.status != "paid":
        await settle_order(
            db,
            order,
            data.get("reference") or data.get("paymentLinkId") or str(data["orderCode"]),
        )
        await db.commit()
    return {"success": True, "status": order.status}


@router.get("/wallet")
async def get_wallet(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    wallet = await get_or_create_wallet(db, user.id)
    await db.commit()
    return {"balance": wallet.balance, "currency": wallet.currency}


@router.get("/account")
async def get_payment_account(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    now = datetime.utcnow()
    pending_wallet_orders = (await db.execute(
        select(PaymentOrder)
        .where(
            PaymentOrder.user_id == user.id,
            PaymentOrder.purpose == "wallet",
            PaymentOrder.method == "payos",
            PaymentOrder.status == "pending",
        )
        .order_by(PaymentOrder.created_at.desc())
    )).scalars().all()
    for order in pending_wallet_orders:
        await reconcile_payos_order(db, order)
    wallet = await get_or_create_wallet(db, user.id)
    subscription = (await db.execute(select(Subscription, SubscriptionPlan).join(SubscriptionPlan, Subscription.plan_id == SubscriptionPlan.id).where(Subscription.user_id == user.id, Subscription.status == "active", Subscription.expires_at > now).order_by(Subscription.expires_at.desc()))).first()
    await db.commit()
    return {
        "wallet": {"balance": wallet.balance, "currency": wallet.currency},
        "subscription": {
            "plan_id": subscription[1].slug,
            "plan_name": subscription[1].name,
            "starts_at": subscription[0].starts_at.isoformat(),
            "expires_at": subscription[0].expires_at.isoformat(),
            "features": subscription[1].features or [],
        } if subscription else None,
    }


@admin_router.get("/pending")
async def pending_orders(db: AsyncSession = Depends(get_db), _: User = Depends(require_role("admin"))) -> dict:
    orders = list((await db.execute(select(PaymentOrder).where(PaymentOrder.status == "awaiting_review").order_by(PaymentOrder.created_at))).scalars().all())
    result = []
    for order in orders:
        plan = await db.get(SubscriptionPlan, order.plan_id) if order.plan_id else None
        result.append(serialize_order(order, plan))
    return {"orders": result}


@admin_router.post("/{order_code}/confirm")
async def confirm_order(order_code: str, req: ConfirmPayload, db: AsyncSession = Depends(get_db), _: User = Depends(require_role("admin"))) -> dict:
    order = (await db.execute(select(PaymentOrder).where(PaymentOrder.order_code == order_code).with_for_update())).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng")
    if order.status == "paid":
        return {"success": True, "status": "paid"}
    if order.status not in {"pending", "awaiting_review"}:
        raise HTTPException(status_code=409, detail="Đơn hàng không ở trạng thái có thể duyệt")
    await settle_order(db, order, req.provider_reference)
    order.reviewed_at = datetime.utcnow()
    await db.commit()
    return {"success": True, "status": order.status}