"""Payment orders, wallet ledger and student subscriptions."""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from app.core.database import Base


class PaymentOrder(Base):
    __tablename__ = "payment_orders"

    id = Column(Integer, primary_key=True)
    order_code = Column(String(40), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("subscription_plans.id"), nullable=True)
    purpose = Column(String(20), nullable=False, default="subscription")
    cycle = Column(String(20), nullable=False)
    amount = Column(Integer, nullable=False)
    proration_credit = Column(Integer, nullable=False, default=0)
    method = Column(String(30), nullable=False)
    status = Column(String(30), nullable=False, default="pending", index=True)
    provider_reference = Column(String(255), nullable=True)
    payment_url = Column(String(1000), nullable=True)
    qr_code = Column(String(4000), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    paid_at = Column(DateTime, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("subscription_plans.id"), nullable=False)
    payment_order_id = Column(Integer, ForeignKey("payment_orders.id"), nullable=False)
    starts_at = Column(DateTime, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    status = Column(String(20), nullable=False, default="active", index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Wallet(Base):
    __tablename__ = "wallets"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    balance = Column(Integer, nullable=False, default=0)
    currency = Column(String(3), nullable=False, default="VND")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"
    __table_args__ = (UniqueConstraint("reference_type", "reference_id", name="uq_wallet_reference"),)

    id = Column(Integer, primary_key=True)
    wallet_id = Column(Integer, ForeignKey("wallets.id"), nullable=False, index=True)
    type = Column(String(20), nullable=False)
    amount = Column(Integer, nullable=False)
    balance_before = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    reference_type = Column(String(30), nullable=False)
    reference_id = Column(String(80), nullable=False)
    status = Column(String(20), nullable=False, default="completed")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)