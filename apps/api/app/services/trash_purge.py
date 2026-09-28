"""TrashPurger — auto-purge documents đã bị soft-delete quá hạn.

Tài liệu bị soft-delete được giữ trong `documents` với `deleted_at` còn 30 ngày.
Mỗi ngày lúc 02:00 (local time) job chạy:
    1. Tìm row có `deleted_at < utcnow() - 30d`
    2. Xoá file trên MinIO (best-effort, log warning nếu lỗi)
    3. Xoá row trong DB (cascade xoá assessments/chunks/...)

In-process asyncio pattern (mirror session_store._periodic_cleanup) — không
thêm dependency. Đăng ký task trong lifespan của `main.py`.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Callable, Optional

from sqlalchemy import select

from app.core.config import settings
from app.models.entities import Document
from app.services.storage import delete_doc

logger = logging.getLogger(__name__)

# Giữ lại row trong thùng rác 30 ngày trước khi purge hẳn.
PURGE_AFTER_DAYS = 30

# Chạy cron lúc 02:00 local time mỗi ngày.
PURGE_HOUR = 2
PURGE_MINUTE = 0

# Batch size — tránh 1 transaction quá lớn nếu user xoá hàng trăm file.
BATCH_SIZE = 100

# Lỗi DB khi query list → sleep 5 phút trước khi thử lại (an toàn).
ERR_BACKOFF_SECONDS = 300


def _seconds_until_next_run(now: Optional[datetime] = None) -> float:
    """Tính số giây tới 02:00 local kế tiếp."""
    now = now or datetime.now()
    target = now.replace(hour=PURGE_HOUR, minute=PURGE_MINUTE, second=0, microsecond=0)
    if target <= now:
        target = target + timedelta(days=1)
    return (target - now).total_seconds()


class TrashPurger:
    """Service purge tài liệu quá hạn. Chạy nền trong FastAPI lifespan."""

    def __init__(self, session_factory: Callable):
        self._session_factory = session_factory
        self._task: Optional[asyncio.Task] = None
        self._stop = asyncio.Event()

    def start(self) -> None:
        """Khởi task nền. Idempotent — gọi nhiều lần vẫn chỉ tạo 1 task."""
        if self._task and not self._task.done():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._loop(), name="trash-purger")
        logger.info(
            "Trash purger scheduled at %02d:%02d daily (cutoff=%dd)",
            PURGE_HOUR, PURGE_MINUTE, PURGE_AFTER_DAYS,
        )

    async def stop(self) -> None:
        """Dừng task nền. Chờ cancel sạch."""
        self._stop.set()
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            except Exception as exc:
                logger.warning("trash purger stop error: %s", exc)

    async def _loop(self) -> None:
        """Vòng lặp chính: sleep tới 02:00 → run_once → lặp lại."""
        # Lần đầu: sleep tới 02:00. Lần sau: sleep 24h (chính xác theo giờ).
        while not self._stop.is_set():
            wait = _seconds_until_next_run()
            logger.debug("trash purger sleeping %.0fs until next run", wait)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=wait)
                # Nếu stop event set trong lúc sleep → thoát
                break
            except asyncio.TimeoutError:
                pass  # tới giờ chạy

            try:
                await self.run_once()
            except Exception as exc:
                logger.exception("trash purger run_once failed: %s", exc)
                # Tránh spam log liên tục nếu DB lỗi kéo dài
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=ERR_BACKOFF_SECONDS)
                    break
                except asyncio.TimeoutError:
                    pass

    async def run_once(self) -> dict:
        """Chạy 1 lần purge. Trả về stats {purged_docs, failed_files}."""
        cutoff = datetime.utcnow() - timedelta(days=PURGE_AFTER_DAYS)
        purged_docs = 0
        failed_files = 0

        async with self._session_factory() as db:
            while True:
                result = await db.execute(
                    select(Document)
                    .where(Document.deleted_at.isnot(None))
                    .where(Document.deleted_at < cutoff)
                    .limit(BATCH_SIZE)
                )
                batch = list(result.scalars().all())
                if not batch:
                    break

                for doc in batch:
                    try:
                        await delete_doc(doc.storage_key, bucket=settings.minio.bucket)
                    except Exception as exc:
                        failed_files += 1
                        logger.warning(
                            "purge: MinIO delete failed id=%s key=%s err=%s",
                            doc.id, doc.storage_key, exc,
                        )
                    await db.delete(doc)
                    purged_docs += 1

                try:
                    await db.commit()
                except Exception:
                    await db.rollback()
                    logger.exception("purge: commit batch failed, aborting run")
                    break

        logger.info(
            "trash purge done: purged=%d failed_files=%d cutoff=%s",
            purged_docs, failed_files, cutoff.isoformat(),
        )
        return {"purged_docs": purged_docs, "failed_files": failed_files}