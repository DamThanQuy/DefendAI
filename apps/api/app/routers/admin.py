"""Admin router — cấu hình hệ thống (chỉ admin)."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_role
from app.services.settings_service import (
    ALLOWED_KEYS,
    apply_settings_to_gateway,
    get_all_settings,
    update_settings,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["Admin"])


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