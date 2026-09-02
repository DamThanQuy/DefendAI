"""Admin router — cấu hình hệ thống (chỉ admin)."""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import require_role
from app.models.assessment import CodeAnalysis, CodeAnalysisStatus
from app.models.entities import Document, User
from app.models.role import Role
from app.models.association import user_roles
from app.models.booking import BookingStatus, MockBooking
from app.services.settings_service import (
    ALLOWED_KEYS,
    apply_settings_to_gateway,
    get_all_settings,
    update_settings,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["Admin"])

ROLE_OPTIONS = ["student", "mentor", "admin"]


# ---------------------------------------------------------------------------
# AI Providers / Models / Feature config — admin quản qua UI, DB là nguồn chính
# ---------------------------------------------------------------------------

def _mask_key(key: str) -> str:
    if not key:
        return ""
    return key[:4] + "..." + key[-4:] if len(key) > 10 else "***"


@router.get(
    "/ai-providers",
    summary="Danh sách AI provider (admin)",
)
async def list_ai_providers(
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
) -> dict:
    from app.models.ai_config import AIProvider, AIModel
    from app.services.ai_client import ai_gateway

    providers = (await db.execute(select(AIProvider).order_by(AIProvider.name))).scalars().all()
    models = (await db.execute(select(AIModel).order_by(AIModel.model_id))).scalars().all()
    models_by_provider: dict[str, list[dict]] = {}
    for m in models:
        models_by_provider.setdefault(m.provider_name, []).append({
            "id": m.id, "model_id": m.model_id, "label": m.label, "enabled": bool(m.enabled),
        })
    return {
        "providers": [
            {
                "name": p.name,
                "base_url": p.base_url,
                "api_key_masked": _mask_key(p.api_key),
                "has_key": bool(p.api_key),
                "enabled": bool(p.enabled),
                "source": ai_gateway.provider_source.get(p.name, "unknown"),
                "runtime_model": (
                    ai_gateway.providers[p.name].get_default_model()
                    if p.name in ai_gateway.providers else None
                ),
                "models": models_by_provider.get(p.name, []),
            }
            for p in providers
        ]
    }


class AIProviderUpsert(BaseModel):
    name: str = Field(..., min_length=1, max_length=50, description="Tên định danh, vd: agnes, nvidia, openrouter")
    base_url: str = Field(..., min_length=1, max_length=500)
    api_key: str = Field("", max_length=500, description="Bỏ trống khi sửa = giữ key cũ")
    enabled: bool = True


@router.post(
    "/ai-providers",
    summary="Thêm AI provider mới (admin)",
)
async def create_ai_provider(
    req: AIProviderUpsert,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
) -> dict:
    from app.models.ai_config import AIProvider
    from app.services.ai_client import ai_gateway

    exists = (await db.execute(
        select(AIProvider).where(AIProvider.name == req.name)
    )).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail=f"Provider '{req.name}' đã tồn tại")
    row = AIProvider(
        name=req.name.strip().lower(),
        base_url=req.base_url.strip().rstrip("/"),
        api_key=req.api_key.strip(),
        enabled=req.enabled,
    )
    db.add(row)
    await db.commit()
    await ai_gateway.reconfigure_from_db(db)
    return {"provider": {"name": row.name, "base_url": row.base_url, "enabled": row.enabled}}


@router.put(
    "/ai-providers/{name}",
    summary="Sửa AI provider (admin)",
)
async def update_ai_provider(
    name: str,
    req: AIProviderUpsert,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
) -> dict:
    from app.models.ai_config import AIProvider
    from app.services.ai_client import ai_gateway

    row = (await db.execute(
        select(AIProvider).where(AIProvider.name == name)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Provider không tồn tại")
    row.base_url = req.base_url.strip().rstrip("/")
    if req.api_key.strip():  # bỏ trống = giữ key cũ
        row.api_key = req.api_key.strip()
    row.enabled = req.enabled
    await db.commit()
    await ai_gateway.reconfigure_from_db(db)
    return {"provider": {"name": row.name, "base_url": row.base_url, "enabled": row.enabled}}


@router.delete(
    "/ai-providers/{name}",
    summary="Xoá AI provider (admin) — cascade models + feature config",
)
async def delete_ai_provider(
    name: str,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
) -> dict:
    from app.models.ai_config import AIProvider
    from app.services.ai_client import ai_gateway
    from app.services.feature_ai import invalidate_cache

    row = (await db.execute(
        select(AIProvider).where(AIProvider.name == name)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Provider không tồn tại")
    await db.delete(row)  # CASCADE xoá ai_models + feature_ai_config trỏ tới
    await db.commit()
    invalidate_cache()
    await ai_gateway.reconfigure_from_db(db)
    return {"deleted": name}


class AIProviderTestResult(BaseModel):
    ok: bool
    detail: str
    models: list[str] = []


@router.post(
    "/ai-providers/{name}/test",
    summary="Test provider: gọi GET {base_url}/models (admin)",
)
async def test_ai_provider(
    name: str,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
) -> dict:
    import httpx
    from app.models.ai_config import AIProvider

    row = (await db.execute(
        select(AIProvider).where(AIProvider.name == name)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Provider không tồn tại")
    headers = {"Authorization": f"Bearer {row.api_key}"} if row.api_key else {}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{row.base_url.rstrip('/')}/models", headers=headers)
            resp.raise_for_status()
            data = resp.json()
            ids = [m.get("id", "") for m in data.get("data", []) if isinstance(m, dict)]
            return {"ok": True, "detail": f"OK — {len(ids)} models", "models": ids[:50]}
    except httpx.HTTPStatusError as e:
        return {"ok": False, "detail": f"HTTP {e.response.status_code}: {e.response.text[:200]}", "models": []}
    except Exception as e:
        return {"ok": False, "detail": repr(e)[:300], "models": []}


class AIModelUpsert(BaseModel):
    provider_name: str = Field(..., max_length=50)
    model_id: str = Field(..., min_length=1, max_length=200)
    label: str = Field("", max_length=200)


@router.post(
    "/ai-models",
    summary="Thêm model cho provider (admin)",
)
async def create_ai_model(
    req: AIModelUpsert,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
) -> dict:
    from app.models.ai_config import AIModel, AIProvider
    from app.services.ai_client import ai_gateway

    prov = (await db.execute(
        select(AIProvider).where(AIProvider.name == req.provider_name)
    )).scalar_one_or_none()
    if not prov:
        raise HTTPException(status_code=404, detail="Provider không tồn tại")
    exists = (await db.execute(
        select(AIModel).where(
            AIModel.provider_name == req.provider_name,
            AIModel.model_id == req.model_id,
        )
    )).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="Model đã tồn tại cho provider này")
    row = AIModel(
        provider_name=req.provider_name,
        model_id=req.model_id.strip(),
        label=req.label.strip() or None,
    )
    db.add(row)
    await db.commit()
    await ai_gateway.reconfigure_from_db(db)
    return {"model": {"id": row.id, "provider_name": row.provider_name, "model_id": row.model_id}}


@router.delete(
    "/ai-models/{model_id}",
    summary="Xoá model (admin)",
)
async def delete_ai_model(
    model_id: int,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
) -> dict:
    from app.models.ai_config import AIModel
    from app.services.ai_client import ai_gateway
    from app.services.feature_ai import invalidate_cache

    row = (await db.execute(select(AIModel).where(AIModel.id == model_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Model không tồn tại")
    await db.delete(row)
    await db.commit()
    invalidate_cache()
    await ai_gateway.reconfigure_from_db(db)
    return {"deleted": model_id}


@router.get(
    "/feature-ai-config",
    summary="Mapping chức năng → provider+model (admin)",
)
async def get_feature_ai_config(
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
) -> dict:
    from app.models.ai_config import FeatureAIConfig
    from app.services.feature_ai import FEATURES

    rows = (await db.execute(select(FeatureAIConfig))).scalars().all()
    by_feature = {r.feature: {"provider_name": r.provider_name, "model_id": r.model_id} for r in rows}
    return {
        "features": FEATURES,
        "config": {f: by_feature.get(f) for f in FEATURES},
    }


class FeatureAIConfigUpdate(BaseModel):
    feature: str = Field(..., max_length=50)
    provider_name: str = Field(..., max_length=50)
    model_id: str = Field(..., max_length=200)


class SettingsUpdate(BaseModel):
    """Request body cho PUT /api/admin/settings — truyền dict các key trong ALLOWED_KEYS."""
    settings: dict[str, str]


@router.put(
    "/feature-ai-config",
    summary="Cập nhật model cho 1 chức năng (admin)",
)
async def update_feature_ai_config(
    req: FeatureAIConfigUpdate,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
) -> dict:
    from app.models.ai_config import FeatureAIConfig, AIModel
    from app.services.feature_ai import FEATURES, invalidate_cache

    if req.feature not in FEATURES:
        raise HTTPException(status_code=400, detail=f"Feature không hợp lệ: {req.feature}")
    # Validate model thuộc provider
    mrow = (await db.execute(
        select(AIModel).where(
            AIModel.provider_name == req.provider_name,
            AIModel.model_id == req.model_id,
        )
    )).scalar_one_or_none()
    if not mrow:
        raise HTTPException(
            status_code=400,
            detail=f"Model '{req.model_id}' chưa được khai báo cho provider '{req.provider_name}'",
        )
    row = (await db.execute(
        select(FeatureAIConfig).where(FeatureAIConfig.feature == req.feature)
    )).scalar_one_or_none()
    if row is None:
        row = FeatureAIConfig(feature=req.feature, provider_name=req.provider_name, model_id=req.model_id)
        db.add(row)
    else:
        row.provider_name = req.provider_name
        row.model_id = req.model_id
    await db.commit()
    invalidate_cache()
    return {"feature": req.feature, "provider_name": req.provider_name, "model_id": req.model_id}


@router.get(
    "/settings",
    summary="Lấy cấu hình hệ thống (admin)",
    description="Trả về toàn bộ app_settings. Chỉ admin.",
)
async def get_settings(
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
) -> dict:
    settings_map = await get_all_settings(db)
    return {
        "settings": settings_map,
        "allowed_keys": sorted(ALLOWED_KEYS),
    }


@router.put(
    "/settings",
    summary="Cập nhật cấu hình hệ thống (admin)",
    description="Cập nhật settings + áp dụng lên AI gateway runtime. Chỉ admin.",
)
async def put_settings(
    req: SettingsUpdate,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
) -> dict:
    settings_map = await update_settings(db, req.settings)
    await apply_settings_to_gateway(settings_map)
    return {"settings": settings_map, "applied": True}


# ---------------------------------------------------------------------------
# Quản lý người dùng (admin)
# ---------------------------------------------------------------------------

@router.get(
    "/users",
    summary="Danh sách người dùng (admin)",
    description="Liệt kê toàn bộ user + roles + trạng thái. Chỉ admin.",
)
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
) -> dict:
    result = await db.execute(
        select(User).options(selectinload(User.roles)).order_by(User.created_at.desc())
    )
    users = [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "full_name": u.full_name,
            "is_active": bool(u.is_active),
            "roles": [r.name for r in u.roles],
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in result.scalars().all()
    ]
    return {"users": users, "role_options": ROLE_OPTIONS}


class UserUpdate(BaseModel):
    is_active: Optional[bool] = None
    roles: Optional[list[str]] = None


@router.put(
    "/users/{user_id}",
    summary="Cập nhật user (admin): khoá/mở + đổi role",
    description="Set is_active và/hoặc thay thế roles. Chỉ admin.",
)
async def update_user(
    user_id: int,
    req: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
) -> dict:
    user = (
        await db.execute(
            select(User).options(selectinload(User.roles)).where(User.id == user_id)
        )
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User không tồn tại")

    if req.is_active is not None:
        user.is_active = 1 if req.is_active else 0

    if req.roles is not None:
        wanted = set(req.roles)
        unknown = wanted - set(ROLE_OPTIONS)
        if unknown:
            raise HTTPException(status_code=400, detail=f"Role không hợp lệ: {sorted(unknown)}")
        roles = (
            await db.execute(select(Role).where(Role.name.in_(wanted)))
        ).scalars().all()
        # Thay thế hoàn toàn roles hiện tại
        await db.execute(user_roles.delete().where(user_roles.c.user_id == user.id))
        for r in roles:
            await db.execute(user_roles.insert().values(user_id=user.id, role_id=r.id))

    await db.commit()
    await db.refresh(user, ["roles"])
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "is_active": bool(user.is_active),
            "roles": [r.name for r in user.roles],
        }
    }


# ---------------------------------------------------------------------------
# Giám sát kết quả AI — Code Review (admin oversight)
# ---------------------------------------------------------------------------

@router.get(
    "/code-reviews",
    summary="Danh sách tất cả code review (admin)",
    description="Xem mọi lượt quét của mọi user (oversight). Chỉ admin. Chi tiết từng analysis dùng GET /api/code/analyses/{id}.",
)
async def list_all_code_reviews(
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
) -> dict:
    result = await db.execute(
        select(CodeAnalysis, Document.filename, User.email)
        .join(Document, Document.id == CodeAnalysis.document_id)
        .join(User, User.id == Document.uploaded_by)
        .order_by(CodeAnalysis.created_at.desc())
    )
    items = [
        {
            "analysis_id": a.id,
            "document_id": a.document_id,
            "document_name": doc_name,
            "user_email": user_email,
            "status": a.status.value,
            "total_files": a.total_files,
            "stats": a.stats_json,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a, doc_name, user_email in result.all()
    ]
    return {"items": items}


# ---------------------------------------------------------------------------
# Tổng quan Dashboard (Overview) — chỉ số vận hành cho Super Admin / Manager
# ---------------------------------------------------------------------------

@router.get(
    "/overview",
    summary="Chỉ số tổng quan hệ thống (admin)",
    description="Tổng doanh thu (placeholder), user mới, session thành công, số booking theo trạng thái. Chỉ admin.",
)
async def overview(
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
) -> dict:
    from sqlalchemy import func

    total_users = (
        await db.execute(select(func.count(User.id))
        .where(User.is_active == 1))
    ).scalar_one()
    new_users = (
        await db.execute(select(func.count(User.id))
        .where(User.is_active == 1))
    ).scalar_one()  # placeholder: chưa có khoảng thời gian — trả toàn bộ active

    total_mentors = (
        await db.execute(
            select(func.count(User.id))
            .join(user_roles, User.id == user_roles.c.user_id)
            .join(Role, Role.id == user_roles.c.role_id)
            .where(Role.name == "mentor", User.is_active == 1)
        )
    ).scalar_one()

    total_bookings = (await db.execute(select(func.count(MockBooking.id)))).scalar_one()
    completed_bookings = (
        await db.execute(select(func.count(MockBooking.id))
        .where(MockBooking.status == BookingStatus.completed))
    ).scalar_one()
    pending_bookings = (
        await db.execute(select(func.count(MockBooking.id))
        .where(MockBooking.status == BookingStatus.pending))
    ).scalar_one()

    total_reviews = (await db.execute(select(func.count(CodeAnalysis.id)))).scalar_one()
    completed_reviews = (
        await db.execute(select(func.count(CodeAnalysis.id))
        .where(CodeAnalysis.status == CodeAnalysisStatus.completed))
    ).scalar_one()

    return {
        "total_users": total_users,
        "new_users": new_users,
        "total_mentors": total_mentors,
        "total_bookings": total_bookings,
        "completed_bookings": completed_bookings,
        "pending_bookings": pending_bookings,
        "total_reviews": total_reviews,
        "completed_reviews": completed_reviews,
        # Doanh thu: chưa có module thanh toán — placeholder 0
        "total_revenue": 0,
    }


# ---------------------------------------------------------------------------
# Dispute Center — danh sách booking để admin phân xử khiếu nại
# ---------------------------------------------------------------------------

@router.get(
    "/bookings",
    summary="Danh sách booking (admin oversight)",
    description="Xem mọi lịch hẹn để xử lý khiếu nại/tranh chấp. Chỉ admin.",
)
async def list_all_bookings(
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
) -> dict:
    result = await db.execute(
        select(MockBooking)
        .options(selectinload(MockBooking.student), selectinload(MockBooking.mentor))
        .order_by(MockBooking.created_at.desc())
    )
    items = [
        {
            "id": b.id,
            "title": b.title,
            "note": b.note,
            "status": b.status.value,
            "proposed_time": b.proposed_time.isoformat() if b.proposed_time else None,
            "confirmed_time": b.confirmed_time.isoformat() if b.confirmed_time else None,
            "reject_reason": b.reject_reason,
            "student_name": b.student.full_name if b.student else None,
            "student_email": b.student.email if b.student else None,
            "mentor_name": b.mentor.full_name if b.mentor else None,
            "mentor_email": b.mentor.email if b.mentor else None,
            "created_at": b.created_at.isoformat() if b.created_at else None,
        }
        for b in result.scalars().all()
    ]
    return {"items": items}