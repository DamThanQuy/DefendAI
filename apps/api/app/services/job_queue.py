"""Async job queue sử dụng Redis.

Cách hoạt động:
- API endpoints tạo job -> Redis Hash `job:{uuid}` + Redis List `queue:defend`
- Worker dùng BLPOP đọc queue -> xử lý -> ghi kết quả vào Redis Hash
- Polling endpoint đọc Redis Hash trả về cho frontend
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

_redis_pool: aioredis.Redis | None = None

JOB_QUEUE_KEY = "queue:defend"
JOB_KEY_PREFIX = "job:"


def _reset_pool() -> None:
    """Reset global Redis pool (force reconnect)."""
    global _redis_pool
    _redis_pool = None


def _job_key(job_id: str) -> str:
    return f"{JOB_KEY_PREFIX}{job_id}"


async def get_redis() -> aioredis.Redis:
    """Lấy Redis connection (singleton pool)."""
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_keepalive=True,
            socket_connect_timeout=5,
            socket_timeout=None,  # no read timeout — needed for BLPOP
            retry_on_timeout=False,
        )
    return _redis_pool


async def create_job(job_type: str, params: dict[str, Any]) -> str:
    """Tạo job mới, push vào queue. Trả về job_id."""
    r = await get_redis()
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    job_data = {
        "job_id": job_id,
        "type": job_type,
        "status": "queued",
        "params": json.dumps(params, ensure_ascii=False),
        "result": "",
        "error": "",
        "created_at": now,
        "updated_at": now,
    }

    await r.hset(_job_key(job_id), mapping=job_data)  # type: ignore[arg-type]
    await r.rpush(JOB_QUEUE_KEY, job_id)
    logger.info("Job %s created: type=%s params=%s", job_id, job_type, params)
    return job_id


async def get_job(job_id: str) -> dict[str, Any] | None:
    """Lấy thông tin job từ Redis."""
    r = await get_redis()
    data = await r.hgetall(_job_key(job_id))
    if not data:
        return None

    result: dict[str, Any] = dict(data)
    for field in ("params", "result", "error"):
        raw = result.get(field)
        if isinstance(raw, str) and raw:
            try:
                parsed = json.loads(raw)
                result[field] = parsed if parsed else None
            except json.JSONDecodeError:
                pass
    return result


async def update_job(
    job_id: str,
    *,
    status: str | None = None,
    result: Any = None,
    error: str | None = None,
    progress: str | None = None,
) -> None:
    """Cập nhật trạng thái job. Chỉ ghi đè field được truyền."""
    r = await get_redis()
    mapping: dict[str, str] = {}
    if status is not None:
        mapping["status"] = status
    if result is not None:
        mapping["result"] = json.dumps(result, ensure_ascii=False, default=str)
    if error is not None:
        mapping["error"] = error
    if progress is not None:
        mapping["progress"] = progress
    mapping["updated_at"] = datetime.now(timezone.utc).isoformat()

    if mapping:
        await r.hset(_job_key(job_id), mapping=mapping)  # type: ignore[arg-type]


# ──────────────────────────────────────────────
# Worker helpers
# ──────────────────────────────────────────────

JobHandler = Callable[[dict[str, Any]], Coroutine[Any, Any, dict[str, Any]]]

_handlers: dict[str, JobHandler] = {}


def register_handler(job_type: str):
    """Decorator đăng ký handler cho một loại job."""
    def wrapper(func: JobHandler) -> JobHandler:
        _handlers[job_type] = func
        return func
    return wrapper


async def process_job(job_id: str) -> None:
    """Xử lý một job: đọc params, gọi handler, ghi kết quả."""
    job = await get_job(job_id)
    if not job:
        logger.error("Job %s not found in Redis", job_id)
        return

    job_type = job.get("type", "")
    handler = _handlers.get(job_type)
    if not handler:
        logger.error("No handler registered for job type: %s", job_type)
        await update_job(job_id, status="failed", error=f"No handler for job type: {job_type}")
        return

    try:
        await update_job(job_id, status="processing")
        params_raw = job.get("params") or {}
        params = params_raw if isinstance(params_raw, dict) else {}
        params["_job_id"] = job_id  # allow handler to emit progress
        result = await handler(params)
        await update_job(job_id, status="completed", result=result)
        logger.info("Job %s completed successfully", job_id)
    except Exception as exc:
        logger.exception("Job %s failed", job_id)
        await update_job(job_id, status="failed", error=f"{type(exc).__name__}: {exc}")


async def worker_loop() -> None:
    """Worker loop: chờ job từ queue, xử lý liên tục."""
    logger.info("Worker started, waiting for jobs...")
    while True:
        try:
            r = await get_redis()
            _, job_id = await r.blpop(JOB_QUEUE_KEY, timeout=0)
            await process_job(job_id)
        except (ConnectionError, TimeoutError, OSError) as exc:
            logger.warning("Redis connection lost, reconnecting in 3s... %s", exc)
            _reset_pool()
            await asyncio.sleep(3)
        except Exception as exc:
            logger.exception("Worker loop error: %s", exc)
            await asyncio.sleep(1)
