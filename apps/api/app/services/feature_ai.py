"""Feature AI resolver — resolve (provider, model) cho từng chức năng.

DB (feature_ai_config) là nguồn chính; fallback về default_provider + model đầu
tiên của provider đó. Kết quả cache ngắn để tránh query DB mỗi request.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as env_settings
from app.models.ai_config import FeatureAIConfig

logger = logging.getLogger(__name__)

# Các chức năng hỗ trợ chọn model riêng (khớp seed migration)
FEATURES = [
    "chat",            # Chat hỏi đáp tài liệu
    "workspace_chat",  # Chat trong workspace
    "code_review",     # Code review AI
    "mock_qa",         # Mock room Q&A
    "question_gen",    # Sinh câu hỏi phản biện
    "classify",        # Phân loại deliverable
    "feedback",        # Feedback sau mock
]

# Cache đơn giản: {feature: (provider, model, expires_at)}
_cache: dict[str, tuple[Optional[str], Optional[str], float]] = {}
_CACHE_TTL = 30.0  # giây — admin đổi config có hiệu lực trong ≤30s mà không cần restart


def invalidate_cache() -> None:
    """Admin mutation gọi để clear cache."""
    _cache.clear()


async def resolve_feature_ai(
    db: AsyncSession, feature: str
) -> tuple[Optional[str], Optional[str]]:
    """
    Trả về (provider_name, model_id) cho chức năng.

    - Ưu tiên feature_ai_config (DB).
    - Fallback: default_provider + model đầu tiên trong gateway.db_models.
    - Trả (None, None) nếu không resolve được → caller dùng default của gateway.
    """
    now = time.monotonic()
    cached = _cache.get(feature)
    if cached and cached[2] > now:
        return cached[0], cached[1]

    provider: Optional[str] = None
    model: Optional[str] = None
    try:
        row = (await db.execute(
            select(FeatureAIConfig).where(FeatureAIConfig.feature == feature)
        )).scalar_one_or_none()
        if row:
            provider, model = row.provider_name, row.model_id or None
    except Exception as e:
        logger.warning("resolve_feature_ai(%s): DB read failed: %s", feature, e)

    if not provider:
        provider = env_settings.routing.default_provider or None

    # Model rỗng → lấy model đầu tiên gateway biết cho provider đó
    if provider and not model:
        from app.services.ai_client import ai_gateway
        models = ai_gateway.db_models.get(provider) or []
        model = models[0] if models else None

    _cache[feature] = (provider, model, now + _CACHE_TTL)
    return provider, model
