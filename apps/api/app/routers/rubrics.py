"""Router rubric — xem/ sửa tiêu chí chuẩn (thước đo AI)."""
from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_role
from app.models.rubric import Rubric
from app.services.rubric_service import get_active_rubric

router = APIRouter(prefix="/api/rubrics", tags=["Rubrics"])


class RubricUpdate(BaseModel):
    name: Optional[str] = None
    version: Optional[str] = None
    is_active: Optional[bool] = None
    config: Optional[dict] = None


@router.get(
    "/active/{scope}",
    summary="Lấy rubric đang active theo scope",
    description="FE panel '📋 Tiêu chí' đọc rubric chuẩn (code_review | defense).",
)
async def get_active(scope: str, db: AsyncSession = Depends(get_db)) -> dict:
    rubric = await get_active_rubric(db, scope=scope)
    if not rubric:
        raise HTTPException(status_code=404, detail=f"Chưa có rubric active cho scope={scope}")
    return {"scope": scope, "config": rubric}


@router.get(
    "/{key}",
    summary="Lấy rubric theo key (admin)",
    description="Chỉ admin.",
)
async def get_rubric(
    key: str,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
) -> dict:
    rubric = (await db.execute(select(Rubric).where(Rubric.key == key))).scalar_one_or_none()
    if not rubric:
        raise HTTPException(status_code=404, detail=f"Rubric {key} không tồn tại")
    return {
        "key": rubric.key,
        "name": rubric.name,
        "scope": rubric.scope,
        "version": rubric.version,
        "is_active": rubric.is_active,
        "config": rubric.config,
        "updated_at": rubric.updated_at.isoformat() if rubric.updated_at else None,
    }


@router.put(
    "/{key}",
    summary="Cập nhật rubric (admin)",
    description="Sửa name/version/is_active/config. Chỉ admin.",
)
async def update_rubric(
    key: str,
    req: RubricUpdate,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
) -> dict:
    rubric = (await db.execute(select(Rubric).where(Rubric.key == key))).scalar_one_or_none()
    if not rubric:
        raise HTTPException(status_code=404, detail=f"Rubric {key} không tồn tại")

    if req.name is not None:
        rubric.name = req.name
    if req.version is not None:
        rubric.version = req.version
    if req.is_active is not None:
        rubric.is_active = req.is_active
    if req.config is not None:
        rubric.config = json.loads(json.dumps(req.config))  # normalize dict→JSONB

    from datetime import datetime
    rubric.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(rubric)
    return {
        "key": rubric.key,
        "name": rubric.name,
        "version": rubric.version,
        "is_active": rubric.is_active,
        "config": rubric.config,
    }
