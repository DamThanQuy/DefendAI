"""Rubric service — đọc rubric chuẩn (thước đo) từ DB."""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rubric import Rubric

logger = logging.getLogger(__name__)


async def get_active_rubric(db: AsyncSession, scope: str) -> dict[str, Any] | None:
    """Trả config JSONB của rubric active theo scope, hoặc None nếu chưa seed."""
    result = await db.execute(
        select(Rubric).where(Rubric.scope == scope, Rubric.is_active.is_(True))
    )
    rubric = result.scalar_one_or_none()
    return dict(rubric.config) if rubric else None


async def get_rubric_by_key(db: AsyncSession, key: str) -> Rubric | None:
    result = await db.execute(select(Rubric).where(Rubric.key == key))
    return result.scalar_one_or_none()
