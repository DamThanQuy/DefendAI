"""Subscription plans managed by administrators."""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, JSON, String

from app.core.database import Base


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id = Column(Integer, primary_key=True)
    slug = Column(String(50), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    tagline = Column(String(255), nullable=False, default="")
    icon = Column(String(20), nullable=False, default="sparkles")
    monthly = Column(Integer, nullable=False, default=0)
    yearly = Column(Integer, nullable=False, default=0)
    featured = Column(Boolean, nullable=False, default=False)
    special = Column(Boolean, nullable=False, default=False)
    badge = Column(String(100), nullable=True)
    cta = Column(String(100), nullable=False, default="Đăng ký")
    features = Column(JSON, nullable=False, default=list)
    active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
