"""Public and admin CRUD endpoints for subscription plans."""
from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_role
from app.models.subscription_plan import SubscriptionPlan

router = APIRouter(prefix="/api/subscriptions", tags=["Subscriptions"])
admin_router = APIRouter(prefix="/api/admin/subscriptions", tags=["Admin subscriptions"])

DEFAULT_PLANS = [
    {"slug": "100001", "name": "Free", "tagline": "Khởi đầu miễn phí", "icon": "sparkles", "monthly": 0, "yearly": 0, "featured": False, "badge": None, "cta": "", "features": [{"label": "Upload tối đa 3 đồ án / tháng", "included": True}, {"label": "Phân tích tài liệu bằng AI cơ bản", "included": True}, {"label": "Tạo 20 câu hỏi phản biện / lượt", "included": True}, {"label": "Mock defense 1 lần / tháng", "included": True}, {"label": "Báo cáo PDF cơ bản", "included": True}, {"label": "Phân tích code chuyên sâu", "included": False}, {"label": "Đánh giá theo rubric chi tiết", "included": False}, {"label": "Hỗ trợ mentor 1-1", "included": False}], "sort_order": 0},
    {"slug": "100002", "name": "Premium", "tagline": "Cho sinh viên nghiêm túc", "icon": "zap", "monthly": 99000, "yearly": 99000, "featured": True, "badge": None, "cta": "", "features": [{"label": "Upload không giới hạn đồ án", "included": True, "highlight": True}, {"label": "Phân tích tài liệu AI nâng cao", "included": True}, {"label": "Không giới hạn câu hỏi phản biện", "included": True}, {"label": "Mock defense không giới hạn", "included": True, "highlight": True}, {"label": "Báo cáo PDF chi tiết + biểu đồ", "included": True}, {"label": "Phân tích code chuyên sâu", "included": True}, {"label": "Đánh giá theo rubric chi tiết", "included": True}, {"label": "Hỗ trợ mentor 1-1", "included": False}], "sort_order": 1},
    {"slug": "100003", "name": "VIP", "tagline": "Trải nghiệm đầy đủ nhất", "icon": "crown", "monthly": 199000, "yearly": 199000, "featured": False, "badge": None, "cta": "", "features": [{"label": "Tất cả tính năng Premium", "included": True, "highlight": True}, {"label": "Phân tích tài liệu AI cao cấp (GPT-4o)", "included": True}, {"label": "Câu hỏi phản biện chuyên sâu theo ngành", "included": True}, {"label": "Mock defense ưu tiên + record phiên", "included": True}, {"label": "Báo cáo PDF chuyên nghiệp cho hội đồng", "included": True}, {"label": "Phân tích code + đề xuất cải thiện", "included": True}, {"label": "Đánh giá rubric + so sánh top sinh viên", "included": True}], "sort_order": 2},
]


class PlanFeature(BaseModel):
    label: str = Field(..., min_length=1, max_length=255)
    included: bool = True
    highlight: bool = False


class PlanPayload(BaseModel):
    slug: str | None = Field(None, pattern=r"^\d{6}$")
    name: str = Field(..., min_length=1, max_length=100)
    tagline: str = Field("", max_length=255)
    price: int = Field(..., ge=0, le=9_999_999)
    featured: bool = False
    special: bool = False
    features: list[PlanFeature] = []
    active: bool = True
    sort_order: int = 0


def serialize(row: SubscriptionPlan) -> dict:
    return {"id": row.id, "slug": row.slug, "name": row.name, "tagline": row.tagline, "icon": row.icon, "price": row.monthly, "featured": row.featured, "special": row.special, "features": row.features or [], "active": row.active, "sort_order": row.sort_order}


async def generate_slug(db: AsyncSession) -> str:
    while True:
        slug = f"{secrets.randbelow(1_000_000):06d}"
        exists = (await db.execute(select(SubscriptionPlan.id).where(SubscriptionPlan.slug == slug))).scalar_one_or_none()
        if exists is None:
            return slug


async def get_plans(db: AsyncSession, active_only: bool) -> list[SubscriptionPlan]:
    query = select(SubscriptionPlan).order_by(SubscriptionPlan.sort_order, SubscriptionPlan.id)
    if active_only:
        query = query.where(SubscriptionPlan.active.is_(True))
    rows = list((await db.execute(query)).scalars().all())
    if rows:
        return rows
    for item in DEFAULT_PLANS:
        db.add(SubscriptionPlan(**item))
    await db.commit()
    return list((await db.execute(query)).scalars().all())


@router.get("/plans")
async def list_public_plans(db: AsyncSession = Depends(get_db)) -> dict:
    return {"plans": [serialize(row) for row in await get_plans(db, True)]}


@admin_router.get("")
async def list_admin_plans(db: AsyncSession = Depends(get_db), _: object = Depends(require_role("admin"))) -> dict:
    return {"plans": [serialize(row) for row in await get_plans(db, False)]}


@admin_router.post("")
async def create_plan(req: PlanPayload, db: AsyncSession = Depends(get_db), _: object = Depends(require_role("admin"))) -> dict:
    slug = req.slug or await generate_slug(db)
    exists = (await db.execute(select(SubscriptionPlan.id).where(SubscriptionPlan.slug == slug))).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status_code=409, detail="Mã gói đã tồn tại")
    values = req.model_dump(exclude={"price", "slug"})
    values.update(slug=slug, monthly=req.price, yearly=req.price, badge=None, cta="", features=[item.model_dump() for item in req.features])
    row = SubscriptionPlan(**values)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"plan": serialize(row)}


@admin_router.put("/{plan_id}")
async def update_plan(plan_id: int, req: PlanPayload, db: AsyncSession = Depends(get_db), _: object = Depends(require_role("admin"))) -> dict:
    row = await db.get(SubscriptionPlan, plan_id)
    if not row:
        raise HTTPException(status_code=404, detail="Gói không tồn tại")
    slug = req.slug or row.slug
    duplicate = (await db.execute(select(SubscriptionPlan.id).where(SubscriptionPlan.slug == slug, SubscriptionPlan.id != plan_id))).scalar_one_or_none()
    if duplicate is not None:
        raise HTTPException(status_code=409, detail="Mã gói đã tồn tại")
    values = req.model_dump(exclude={"price", "slug"})
    values.update(slug=slug, monthly=req.price, yearly=req.price, badge=None, cta="", features=[item.model_dump() for item in req.features])
    for key, value in values.items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return {"plan": serialize(row)}


@admin_router.delete("/{plan_id}")
async def delete_plan(plan_id: int, db: AsyncSession = Depends(get_db), _: object = Depends(require_role("admin"))) -> dict:
    row = await db.get(SubscriptionPlan, plan_id)
    if not row:
        raise HTTPException(status_code=404, detail="Gói không tồn tại")
    await db.delete(row)
    await db.commit()
    return {"deleted": plan_id}
