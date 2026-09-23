"""Worker handler for bounded project archive extraction."""
from __future__ import annotations

from typing import Any

from app.services.archive_extractor import (
    cleanup_stale_extraction_dirs,
    extract_selected_zip_from_minio,
)
from app.services.archive_validator import ArchiveLimits
from app.services.job_queue import register_handler
from app.core.config import settings


@register_handler("selective_extraction")
async def handle_selective_extraction(params: dict[str, Any]) -> dict[str, Any]:
    """Extract a worker-local ZIP and return metadata only.

    Phase 2 will connect this handler to a persisted analysis job/document
    repository. For now the handler accepts a worker-local ``archive_path`` so
    it can be exercised without adding a new database model in Phase 1.
    """
    job_id = str(params.get("_job_id") or params.get("job_id") or "archive-analysis")
    temp_dir = params.get("temp_dir") or settings.archive_analysis.temp_dir
    defaults = settings.archive_analysis
    limits = ArchiveLimits(
        max_archive_bytes=int(params.get("max_archive_bytes", defaults.max_archive_bytes)),
        max_expanded_bytes=int(params.get("max_expanded_bytes", defaults.max_expanded_bytes)),
        max_entries=int(params.get("max_entries", defaults.max_entries)),
        max_entry_bytes=int(params.get("max_entry_bytes", defaults.max_entry_bytes)),
        max_compression_ratio=float(params.get("max_compression_ratio", defaults.max_compression_ratio)),
        max_nested_archive_depth=int(params.get("max_nested_archive_depth", defaults.max_nested_archive_depth)),
    )
    bucket = params.get("bucket") or settings.minio.bucket
    storage_key = params.get("storage_key")
    if not storage_key:
        raise ValueError("storage_key is required for selective_extraction")
    cleanup_stale_extraction_dirs(temp_dir)
    result = await extract_selected_zip_from_minio(
        bucket=bucket,
        key=str(storage_key),
        job_id=job_id,
        temp_dir=temp_dir,
        limits=limits,
        timeout_seconds=int(params.get("timeout_seconds", settings.archive_analysis.timeout_seconds)),
    )
    return {
        "archive_type": result.validation.archive_type,
        "entry_count": result.validation.entry_count,
        "selected_count": len(result.selected_files),
        "skipped_count": len(result.validation.entries) - len(result.selected_files),
        "expanded_bytes": result.validation.expanded_bytes,
        "warnings": result.validation.warnings,
    }