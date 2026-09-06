"""ProjectManifest — chuyển ExtractionResult → JSON manifest có schema cố định.

Mục tiêu: cung cấp cho Step 3 / Step 4 một manifest chuẩn để truy xuất evidence
mà không cần truy cập lại ZIP. Manifest **không chứa nội dung file** — chỉ siêu
dữ liệu + skip reason. Snippet thực tế được ``source_indexer`` trích xuất và
lưu vào ``project_evidence``.

LLM **không** tham gia vào bước này. Mọi thông tin đều deterministic và đếm được.
"""
from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable

from app.services.archive_extractor import ExtractionResult

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ManifestFile:
    """One row in the project manifest."""

    path: str
    extension: str
    language: str | None
    size: int
    sha256: str | None
    frameworks: list[str] = field(default_factory=list)
    selection_mode: str = "framework_aware"
    skip_reason: str | None = None

    def to_dict(self) -> dict:
        data = asdict(self)
        # ``None`` skip_reason không cần thiết cho người đọc JSON
        if data.get("skip_reason") is None:
            data.pop("skip_reason", None)
        return data


_LANGUAGE_BY_EXT = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".java": "java",
    ".kt": "kotlin",
    ".go": "go",
    ".php": "php",
    ".rb": "ruby",
    ".rs": "rust",
    ".swift": "swift",
    ".dart": "dart",
    ".scala": "scala",
    ".cs": "csharp",
    ".cpp": "cpp",
    ".c": "c",
    ".h": "c",
    ".vue": "vue",
    ".svelte": "svelte",
    ".html": "html",
    ".jinja2": "jinja2",
    ".hbs": "handlebars",
    ".ejs": "ejs",
    ".razor": "razor",
    ".cshtml": "cshtml",
    ".blade.php": "blade",
    ".scss": "scss",
    ".sass": "sass",
    ".less": "less",
    ".css": "css",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".ini": "ini",
    ".xml": "xml",
    ".sql": "sql",
    ".graphql": "graphql",
    ".prisma": "prisma",
    ".md": "markdown",
}


def _language_for(path: str) -> str | None:
    from pathlib import PurePosixPath

    name = PurePosixPath(path).name.lower()
    if name in {"dockerfile", "makefile", "artisan", "manage.py"}:
        return name
    suffix = PurePosixPath(path).suffix.lower()
    return _LANGUAGE_BY_EXT.get(suffix)


def _file_hash(local_path: Path, chunk_size: int = 1024 * 1024) -> str | None:
    """Compute SHA256 of the local file in bounded chunks.

    Returns None on failure so the manifest can still be built (the file is
    recoverable from MinIO if needed).
    """
    import hashlib

    try:
        h = hashlib.sha256()
        with local_path.open("rb") as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()
    except OSError as exc:
        logger.warning("Failed to hash %s: %s", local_path, exc)
        return None


def build_project_manifest(extraction: ExtractionResult) -> dict:
    """Build a serialisable manifest from an ``ExtractionResult``.

    The manifest is a JSON-friendly dict. The DB persistence layer will JSON
    encode it before writing into ``project_manifests.manifest_json``.
    """
    framework = extraction.validation.framework.name or "generic"
    selection_mode = extraction.validation.selection_mode or "generic_fallback"
    selected_paths = {entry.path for entry in extraction.validation.selected_entries}
    skipped = {
        entry.path: entry.skip_reason
        for entry in extraction.validation.entries
        if not entry.selected
    }

    files: list[ManifestFile] = []
    total_size = 0
    for entry in extraction.validation.entries:
        path = entry.path
        size = entry.expanded_size
        total_size += size
        if path in selected_paths:
            sha = next(
                (ef.local_path for ef in extraction.selected_files if ef.path == path),
                None,
            )
            sha_hex = _file_hash(sha) if sha else None
            files.append(ManifestFile(
                path=path,
                extension=Path(path).suffix.lower(),
                language=_language_for(path),
                size=size,
                sha256=sha_hex,
                frameworks=[framework] if framework != "generic" else [],
                selection_mode=selection_mode,
            ))
        else:
            files.append(ManifestFile(
                path=path,
                extension=Path(path).suffix.lower(),
                language=_language_for(path),
                size=size,
                sha256=None,
                frameworks=[framework] if framework != "generic" else [],
                selection_mode=selection_mode,
                skip_reason=skipped.get(path),
            ))

    return {
        "framework": framework,
        "selection_mode": selection_mode,
        "warnings": list(extraction.validation.warnings),
        "file_count": len(extraction.validation.entries),
        "selected_count": len(selected_paths),
        "skipped_count": len(skipped),
        "total_size": total_size,
        "files": [f.to_dict() for f in files],
    }


def iter_selected_files(extraction: ExtractionResult) -> Iterable[tuple[Path, str]]:
    """Yield ``(local_path, relative_path)`` for files that were extracted."""
    for ef in extraction.selected_files:
        yield ef.local_path, ef.path


def iter_selected_manifest_files(manifest: dict) -> Iterable[dict]:
    """Yield manifest file dicts whose ``skip_reason`` is absent/None."""
    for entry in manifest.get("files", []):
        if entry.get("skip_reason"):
            continue
        yield entry