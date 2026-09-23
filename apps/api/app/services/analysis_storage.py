"""Storage lifecycle helpers for ZIP/BR analysis jobs.

Step 2 categorises storage into 3 layers:

1. **Long-term storage** — MinIO + PostgreSQL — ZIP gốc, documents, manifests,
   evidence rows, match results. Never deleted by this module.
2. **Worker temporary volume** — ``ANALYSIS_TEMP_DIR`` — extraction directory
   per job. Created/destroyed by the worker, purged by stale-cleanup helpers.
3. **Process memory** — function-level buffers, embedder request batches.
   Released as soon as the embedding/parsing step returns.

This module is the single entry point that workers use to obtain a temp
directory and to clean it up. It enforces the disk-quota guard and surfaces a
``StorageUnavailable`` exception so the job can transition to ``rejected``
*before* extraction starts.
"""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncIterator

from app.core.config import settings

logger = logging.getLogger(__name__)


class StorageUnavailable(RuntimeError):
    """Raised when the worker cannot allocate a temp directory for a job."""


@dataclass(frozen=True, slots=True)
class StorageAllocation:
    """Allocated temp directory for one job.

    ``root`` is created synchronously by ``acquire_job_temp_dir`` but cleaned up
    by the caller (or by the stale-cleanup scheduler).
    """

    root: Path
    job_id: str
    acquired_bytes: int  # how much free space we saw at allocation time


def _min_free_bytes() -> int:
    cfg = settings.analysis_storage
    if cfg is None:  # defensive — model_post_init always sets it
        return 0
    return cfg.min_free_disk_bytes


def has_sufficient_disk_space(path: Path | str) -> bool:
    """Return True if the directory has at least ``min_free_disk_bytes`` free."""
    target = Path(path)
    if not target.exists():
        target = target.parent
    try:
        free = shutil.disk_usage(target).free
    except FileNotFoundError:
        return True  # parent will be created — assume OK
    return free >= _min_free_bytes()


@asynccontextmanager
async def job_temp_dir(
    job_id: str,
    *,
    cleanup_on_finish: bool = True,
) -> AsyncIterator[StorageAllocation]:
    """Async context manager that yields a job-scoped temp directory.

    The directory is created under ``ANALYSIS_TEMP_DIR``. If cleanup is
    requested the directory is removed in ``finally``. Disk usage is checked
    on entry; insufficient space raises ``StorageUnavailable``.
    """
    cfg = settings.analysis_storage
    base = Path(cfg.temp_dir if cfg else "/var/lib/defendai/analysis-tmp")
    base.mkdir(parents=True, exist_ok=True)
    if not has_sufficient_disk_space(base):
        raise StorageUnavailable(
            f"Insufficient disk space on {base}: free < {_min_free_bytes()} bytes"
        )
    root = Path(os.path.join(base, job_id))
    root.mkdir(parents=False, exist_ok=False)
    free = shutil.disk_usage(root).free
    allocation = StorageAllocation(root=root, job_id=job_id, acquired_bytes=free)
    logger.info("Allocated job temp dir %s (free=%d bytes)", root, free)
    try:
        yield allocation
    finally:
        if cleanup_on_finish:
            try:
                shutil.rmtree(root, ignore_errors=True)
                logger.info("Cleaned up job temp dir %s", root)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to cleanup %s: %s", root, exc)


async def cleanup_stale_storage(temp_dir: str | None = None, *, older_than_seconds: int | None = None) -> int:
    """Remove stale job directories left by crashed workers.

    Runs as a periodic background task. Returns the number of entries removed.
    """
    cfg = settings.analysis_storage
    base = Path(temp_dir or (cfg.temp_dir if cfg else "/var/lib/defendai/analysis-tmp"))
    if not base.exists():
        return 0
    threshold = older_than_seconds if older_than_seconds is not None else cfg.cleanup_stale_seconds
    if threshold is None:
        return 0
    removed = 0
    import time

    now = time.time()
    for child in base.iterdir():
        try:
            if now - child.stat().st_mtime <= threshold:
                continue
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink()
            removed += 1
        except FileNotFoundError:
            continue
        except Exception as exc:  # noqa: BLE001
            logger.warning("Cleanup of %s failed: %s", child, exc)
    if removed:
        logger.info("Cleanup removed %d stale entries from %s", removed, base)
    return removed


async def run_periodic_cleanup(interval_seconds: int = 6 * 60 * 60) -> None:
    """Background coroutine that periodically purges stale temp dirs.

    Sleeps ``interval_seconds`` between runs. Cancellation is graceful.
    """
    while True:
        try:
            await cleanup_stale_storage()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Periodic cleanup failed: %s", exc)
        await asyncio.sleep(interval_seconds)