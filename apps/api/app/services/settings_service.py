"""Settings service — đọc/ghi cấu hình hệ thống từ DB (app_settings)."""
from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting

logger = logging.getLogger(__name__)

# Keys được phép chỉnh qua admin UI (whitelist — tránh ghi bừa).
ALLOWED_KEYS = {
    "default_provider",
    "localhost_api_key",
    "localhost_base_url",
    "localhost_model",
}


async def get_all_settings(db: AsyncSession) -> dict[str, str]:
    """Trả về toàn bộ settings dạng {key: value}."""
    result = await db.execute(select(AppSetting))
    return {s.key: s.value or "" for s in result.scalars().all()}


async def update_settings(db: AsyncSession, updates: dict[str, Any]) -> dict[str, str]:
    """Cập nhật settings (chỉ key trong whitelist). Trả về settings mới."""
    for key, value in updates.items():
        if key not in ALLOWED_KEYS:
            logger.warning("Ignoring disallowed setting key: %s", key)
            continue
        row = (
            await db.execute(select(AppSetting).where(AppSetting.key == key))
        ).scalar_one_or_none()
        if row is None:
            row = AppSetting(key=key, value=str(value))
            db.add(row)
        else:
            row.value = str(value)
    await db.commit()
    return await get_all_settings(db)


async def apply_settings_to_gateway(settings_map: dict[str, str], db: AsyncSession | None = None) -> None:
    """Áp dụng settings DB lên ai_gateway (reconfigure providers + routing)."""
    from app.services.ai_client import ai_gateway
    from app.core.config import settings as env_settings

    # Routing
    if settings_map.get("default_provider"):
        env_settings.routing.default_provider = settings_map["default_provider"]

    # Reconfigure providers từ DB (ai_providers/ai_models) — tạo được provider mới,
    # không còn giới hạn "chỉ update provider có sẵn".
    await ai_gateway.reconfigure_from_db(db)

    logger.info("Applied DB settings to AI gateway: default=%s",
                env_settings.routing.default_provider)