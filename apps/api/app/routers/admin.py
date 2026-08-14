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
from app.services.settings_service import (
    ALLOWED_KEYS,
    apply_settings_to_gateway,
    get_all_settings,
    update_settings,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["Admin"])

ROLE_OPTIONS = ["student", "mentor", "admin"]


class SettingsUpdate(BaseModel):
    settings: dict[str, str] = Field(..., description="Map key → value cần cập nhật")


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
    apply_settings_to_gateway(settings_map)
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