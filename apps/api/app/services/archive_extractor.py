"""Bounded, isolated ZIP extraction for background workers."""
from __future__ import annotations

import asyncio
import os
import shutil
import tempfile
import time
import zipfile
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import AsyncIterator

from app.services.storage import iter_object_chunks

from app.services.archive_validator import (
    ArchiveLimits,
    ArchiveValidationError,
    ArchiveValidationResult,
    validate_zip_metadata,
)


@dataclass(frozen=True, slots=True)
class ExtractedFile:
    path: str
    local_path: Path
    size: int


@dataclass(slots=True)
class ExtractionResult:
    validation: ArchiveValidationResult
    root_dir: Path
    selected_files: list[ExtractedFile] = field(default_factory=list)


async def download_archive_to_temp(
    *,
    bucket: str,
    key: str,
    temp_dir: str | Path | None = None,
    max_bytes: int,
    job_id: str,
) -> Path:
    """Stream an archive from MinIO into a worker-local temporary file."""
    base = Path(temp_dir) if temp_dir else Path(tempfile.gettempdir()) / "defendai-analysis-tmp"
    base.mkdir(parents=True, exist_ok=True)
    fd, raw_path = tempfile.mkstemp(prefix=f"{job_id}-", suffix=".zip", dir=base)
    os.close(fd)
    destination = Path(raw_path)
    downloaded = 0
    try:
        with destination.open("wb") as target:
            async for chunk in iter_object_chunks(bucket, key):
                downloaded += len(chunk)
                if downloaded > max_bytes:
                    raise ArchiveValidationError("Compressed archive exceeds the configured size limit")
                target.write(chunk)
        return destination
    except Exception:
        destination.unlink(missing_ok=True)
        raise


async def extract_selected_zip_from_minio(
    *,
    bucket: str,
    key: str,
    job_id: str,
    temp_dir: str | Path | None = None,
    limits: ArchiveLimits | None = None,
    timeout_seconds: int = 600,
    cleanup: bool = True,
) -> ExtractionResult:
    """Download, validate and extract a ZIP without retaining the archive.

    When ``cleanup`` is ``False`` the extraction root is left on disk so the
    caller can keep reading files (e.g. the indexer). The caller is then
    responsible for removing ``ExtractionResult.root_dir``.
    """
    limits = limits or ArchiveLimits()
    archive_path = await download_archive_to_temp(
        bucket=bucket,
        key=key,
        temp_dir=temp_dir,
        max_bytes=limits.max_archive_bytes,
        job_id=job_id,
    )
    try:
        return await extract_selected_zip(
            archive_path,
            job_id=job_id,
            temp_dir=temp_dir,
            limits=limits,
            timeout_seconds=timeout_seconds,
            cleanup=cleanup,
        )
    finally:
        archive_path.unlink(missing_ok=True)


def cleanup_stale_extraction_dirs(
    temp_dir: str | Path,
    *,
    older_than_seconds: int = 24 * 60 * 60,
) -> int:
    """Remove stale job directories/files left by a crashed worker."""
    root = Path(temp_dir)
    if not root.exists():
        return 0
    now = time.time()
    removed = 0
    for child in root.iterdir():
        try:
            if now - child.stat().st_mtime <= older_than_seconds:
                continue
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink()
            removed += 1
        except FileNotFoundError:
            continue
    return removed


def _contained_path(root: Path, relative_path: str) -> Path:
    candidate = (root / relative_path).resolve()
    root_resolved = root.resolve()
    if candidate != root_resolved and root_resolved not in candidate.parents:
        raise ArchiveValidationError(f"Extraction path escapes its root: {relative_path}")
    return candidate


@asynccontextmanager
async def isolated_extraction_dir(
    job_id: str,
    *,
    temp_dir: str | Path | None = None,
) -> AsyncIterator[Path]:
    """Create and always remove a job-scoped extraction directory."""
    base = Path(temp_dir) if temp_dir else Path(tempfile.gettempdir()) / "defendai-analysis-tmp"
    base.mkdir(parents=True, exist_ok=True)
    root = Path(tempfile.mkdtemp(prefix=f"{job_id}-", dir=base))
    try:
        yield root
    finally:
        shutil.rmtree(root, ignore_errors=True)


async def extract_selected_zip(
    archive_path: str | Path,
    *,
    job_id: str,
    temp_dir: str | Path | None = None,
    limits: ArchiveLimits | None = None,
    cleanup: bool = True,
    timeout_seconds: int = 600,
) -> ExtractionResult:
    """Validate and selectively extract a local ZIP using bounded I/O.

    The ZIP itself is expected to have been downloaded by the worker into a
    temporary file. This function never uses ``extractall`` and never executes
    extracted content.
    """
    limits = limits or ArchiveLimits()
    source = Path(archive_path).resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    archive_bytes = source.stat().st_size
    if archive_bytes > limits.max_archive_bytes:
        raise ArchiveValidationError("Compressed archive exceeds the configured size limit")

    async def _run() -> ExtractionResult:
        with zipfile.ZipFile(source, "r") as archive:
            validation = validate_zip_metadata(
                archive,
                archive_bytes=archive_bytes,
                limits=limits,
            )
            context = isolated_extraction_dir(job_id, temp_dir=temp_dir)
            if cleanup:
                async with context as root:
                    return _extract_into(archive, validation, root, limits)
            base = Path(temp_dir) if temp_dir else Path(tempfile.gettempdir()) / "defendai-analysis-tmp"
            base.mkdir(parents=True, exist_ok=True)
            root = Path(tempfile.mkdtemp(prefix=f"{job_id}-", dir=base))
            return _extract_into(archive, validation, root, limits)

    return await asyncio.wait_for(_run(), timeout=timeout_seconds)


def _extract_into(
    archive: zipfile.ZipFile,
    validation: ArchiveValidationResult,
    root: Path,
    limits: ArchiveLimits,
) -> ExtractionResult:
    selected_files: list[ExtractedFile] = []
    written = 0
    by_path = {entry.path: entry for entry in validation.selected_entries}
    info_by_path = {info.filename.replace("\\", "/"): info for info in archive.infolist()}
    for path in by_path:
        info = info_by_path.get(path)
        if info is None:
            continue
        destination = _contained_path(root, path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(info, "r") as source, destination.open("xb") as target:
            while True:
                chunk = source.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > limits.max_expanded_bytes:
                    raise ArchiveValidationError("Extraction exceeded the expanded-size limit")
                if shutil.disk_usage(root).free < len(chunk):
                    raise OSError("Insufficient disk space for archive extraction")
                target.write(chunk)
        os.chmod(destination, 0o600)
        selected_files.append(ExtractedFile(path=path, local_path=destination, size=destination.stat().st_size))
    return ExtractionResult(validation=validation, root_dir=root, selected_files=selected_files)