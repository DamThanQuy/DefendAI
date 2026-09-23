"""Safety-first ZIP metadata validation for project analysis.

This module deliberately does not extract files.  It validates the ZIP central
directory before a worker writes anything to the analysis temporary directory.
"""
from __future__ import annotations

import posixpath
import json
import stat
import zipfile
from dataclasses import dataclass, field
from pathlib import PurePosixPath


class ArchiveValidationError(ValueError):
    """Raised when an archive cannot be safely analyzed."""


DEFAULT_SOURCE_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".java", ".cs", ".go",
    ".php", ".rb", ".kt", ".c", ".cpp", ".h", ".html", ".css",
}
DEFAULT_TEXT_EXTENSIONS = {
    ".json", ".yaml", ".yml", ".toml", ".ini", ".env.example", ".sql",
    ".graphql", ".prisma", ".md", ".txt",
}
DEFAULT_SKIP_DIRS = {
    ".git", "node_modules", "dist", "build", "coverage", "target",
    "__pycache__", ".next", "venv", ".venv", ".nuxt", ".cache",
}
DEFAULT_SKIP_SUFFIXES = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4", ".iso", ".exe",
    ".dll", ".so", ".dylib", ".class", ".pyc", ".min.js", ".min.css",
}
MANIFEST_NAMES = {
    "package.json", "composer.json", "requirements.txt", "pyproject.toml",
    "pipfile", "pom.xml", "build.gradle", "settings.gradle", "cargo.toml",
    "go.mod", "pubspec.yaml", "gemfile", "mix.exs", "angular.json",
    "artisan", "manage.py", "dockerfile", "docker-compose.yml", "makefile",
}
FRAMEWORK_EXTENSIONS = {
    ".rs", ".swift", ".dart", ".scala", ".ex", ".exs", ".hs", ".sol",
    ".vue", ".svelte", ".scss", ".sass", ".less", ".razor", ".cshtml",
    ".tf", ".proto", ".properties", ".csproj", ".sln", ".blade.php",
}


@dataclass(frozen=True, slots=True)
class ArchiveLimits:
    """Resource and safety limits for one archive analysis."""

    max_archive_bytes: int = 20 * 1024 * 1024 * 1024
    max_expanded_bytes: int = 100 * 1024 * 1024 * 1024
    max_entries: int = 100_000
    max_entry_bytes: int = 50 * 1024 * 1024
    max_compression_ratio: float = 1_000.0
    max_nested_archive_depth: int = 1
    reject_nested_archives: bool = False
    max_manifest_bytes: int = 1024 * 1024


@dataclass(frozen=True, slots=True)
class FrameworkDetection:
    name: str = "generic"
    confidence: str = "low"
    evidence: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class ArchiveEntry:
    path: str
    compressed_size: int
    expanded_size: int
    is_dir: bool
    is_symlink: bool
    is_nested_archive: bool
    selected: bool
    skip_reason: str | None = None


@dataclass(slots=True)
class ArchiveValidationResult:
    archive_type: str
    archive_bytes: int
    entry_count: int
    compressed_bytes: int
    expanded_bytes: int
    entries: list[ArchiveEntry] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    framework: FrameworkDetection = field(default_factory=FrameworkDetection)
    selection_mode: str = "generic_fallback"

    @property
    def selected_entries(self) -> list[ArchiveEntry]:
        return [entry for entry in self.entries if entry.selected]


def validate_member_path(name: str) -> str:
    """Return a normalized safe POSIX path or raise."""
    if not name or "\x00" in name:
        raise ArchiveValidationError("Archive entry has an invalid name")
    normalized = name.replace("\\", "/")
    if normalized.startswith("/") or normalized.startswith("//"):
        raise ArchiveValidationError(f"Absolute archive path is not allowed: {name}")
    if len(normalized) >= 2 and normalized[1] == ":":
        raise ArchiveValidationError(f"Drive-qualified archive path is not allowed: {name}")
    parts = PurePosixPath(normalized).parts
    if ".." in parts:
        raise ArchiveValidationError(f"Path traversal is not allowed: {name}")
    cleaned = posixpath.normpath(normalized)
    if cleaned in ("", ".") or cleaned == ".." or cleaned.startswith("../"):
        raise ArchiveValidationError(f"Unsafe archive path: {name}")
    return cleaned


def is_symlink(info: zipfile.ZipInfo) -> bool:
    """Detect Unix symlink entries encoded in ZipInfo.external_attr."""
    mode = (info.external_attr >> 16) & 0xFFFF
    return stat.S_ISLNK(mode)


def is_nested_archive(path: str) -> bool:
    suffix = PurePosixPath(path).suffix.lower()
    return suffix in {".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".rar", ".7z"}


def archive_depth(path: str) -> int:
    """Return archive nesting implied by path components, e.g. ``a.zip/b.zip``."""
    return sum(1 for part in PurePosixPath(path).parts if is_nested_archive(part))


def _is_skipped_path(path: str) -> str | None:
    parts = PurePosixPath(path).parts
    if any(part in DEFAULT_SKIP_DIRS for part in parts):
        return "ignored_directory"
    lower = path.lower()
    if any(lower.endswith(suffix) for suffix in DEFAULT_SKIP_SUFFIXES):
        return "ignored_binary_or_generated_file"
    return None


def _is_selectable(path: str) -> bool:
    suffix = PurePosixPath(path).suffix.lower()
    name = PurePosixPath(path).name.lower()
    return suffix in DEFAULT_SOURCE_EXTENSIONS or suffix in DEFAULT_TEXT_EXTENSIONS or name in {
        "readme", "readme.md", "requirements.txt", "package.json", "pyproject.toml",
    }


def _manifest_candidate(path: str) -> bool:
    normalized = path.lower().replace("\\", "/")
    name = PurePosixPath(normalized).name
    return name in MANIFEST_NAMES or name.startswith("next.config") or name.startswith("nuxt.config")


def _manifest_text(archive: zipfile.ZipFile, info: zipfile.ZipInfo, max_bytes: int) -> str | None:
    if info.file_size > max_bytes:
        return None
    try:
        return archive.read(info).decode("utf-8", errors="replace")
    except (OSError, RuntimeError, ValueError, UnicodeError):
        return None


def detect_framework(
    archive: zipfile.ZipFile,
    *,
    max_manifest_bytes: int = 1024 * 1024,
) -> FrameworkDetection:
    """Detect common frameworks from bounded filenames and manifest content."""
    names = [info.filename.replace("\\", "/") for info in archive.infolist()]
    lower_names = {name.lower() for name in names}
    evidence: list[str] = []
    dependencies: set[str] = set()
    for info in archive.infolist():
        path = info.filename.replace("\\", "/")
        if not _manifest_candidate(path):
            continue
        text = _manifest_text(archive, info, max_manifest_bytes)
        if not text:
            continue
        if path.lower().endswith(("package.json", "composer.json")):
            try:
                parsed = json.loads(text)
                raw_deps = {**parsed.get("dependencies", {}), **parsed.get("devDependencies", {})}
                dependencies.update(str(key).lower() for key in raw_deps)
            except json.JSONDecodeError:
                pass
        dependencies.update(line.strip().lower() for line in text.splitlines() if line.strip())
        evidence.append(path)

    rules: list[tuple[str, bool, str]] = [
        ("nextjs", any(name.startswith("next.config") for name in lower_names) or "next" in dependencies, "next marker/dependency"),
        ("nuxt", any(name.startswith("nuxt.config") for name in lower_names) or "nuxt" in dependencies, "nuxt marker/dependency"),
        ("angular", "angular.json" in lower_names or "@angular/core" in dependencies, "angular marker/dependency"),
        ("vue", "vue" in dependencies, "vue dependency"),
        ("react", bool({"react", "react-dom"} & dependencies), "react dependency"),
        ("django", "manage.py" in lower_names or "django" in dependencies, "django marker/dependency"),
        ("fastapi", "fastapi" in dependencies, "fastapi dependency"),
        ("flask", "flask" in dependencies, "flask dependency"),
        ("spring", "spring" in " ".join(dependencies), "spring dependency"),
        ("dotnet", any(name.endswith((".csproj", ".sln")) for name in lower_names), ".NET project marker"),
        ("laravel", "artisan" in lower_names or "laravel/framework" in dependencies, "laravel marker/dependency"),
        ("rails", "rails" in dependencies or "config/routes.rb" in lower_names, "rails marker/dependency"),
    ]
    for name, matched, reason in rules:
        if matched:
            return FrameworkDetection(name=name, confidence="high", evidence=tuple(evidence + [reason]))
    return FrameworkDetection(evidence=tuple(evidence))


def _is_selectable_for_framework(path: str, framework: FrameworkDetection) -> bool:
    lower = path.lower()
    suffix = PurePosixPath(lower).suffix
    name = PurePosixPath(lower).name
    if _is_selectable(path) or suffix in FRAMEWORK_EXTENSIONS:
        return True
    framework_files = {
        "nextjs": ("next.config", "tsconfig", "vite.config"),
        "nuxt": ("nuxt.config", "tsconfig", "vite.config"),
        "react": ("tsconfig", "vite.config"),
        "vue": ("tsconfig", "vite.config"),
        "angular": ("angular.json", "tsconfig"),
        "django": ("manage.py", "alembic.ini"),
        "fastapi": ("alembic.ini",),
        "dotnet": ("appsettings", "directory.build.props"),
        "spring": ("application.properties", "application.yml", "application.yaml"),
        "laravel": ("artisan",),
        "rails": ("gemfile",),
    }
    return any(name.startswith(marker) or lower.endswith(marker) for marker in framework_files.get(framework.name, ()))


def validate_zip_metadata(
    archive: zipfile.ZipFile,
    *,
    archive_bytes: int,
    limits: ArchiveLimits | None = None,
) -> ArchiveValidationResult:
    """Validate ZIP metadata without reading/decompressing member content."""
    limits = limits or ArchiveLimits()
    if archive_bytes > limits.max_archive_bytes:
        raise ArchiveValidationError("Compressed archive exceeds the configured size limit")

    infos = archive.infolist()
    if len(infos) > limits.max_entries:
        raise ArchiveValidationError("Archive contains too many entries")

    framework = detect_framework(archive, max_manifest_bytes=limits.max_manifest_bytes)
    result = ArchiveValidationResult(
        archive_type="zip",
        archive_bytes=archive_bytes,
        entry_count=len(infos),
        compressed_bytes=0,
        expanded_bytes=0,
        framework=framework,
        selection_mode="framework_aware" if framework.name != "generic" else "generic_fallback",
    )
    nested_depth = 0
    for info in infos:
        path = validate_member_path(info.filename)
        symlink = is_symlink(info)
        nested = is_nested_archive(path)
        nested_depth = max(nested_depth, archive_depth(path))
        if symlink:
            raise ArchiveValidationError(f"Symlink archive entry is not allowed: {path}")

        # Determine skip reason FIRST — build artifacts (node_modules, .next,
        # .git, ...) are excluded from analysis, so their individual file sizes
        # and compression ratios must not fail the whole job.
        skip_reason = _is_skipped_path(path)
        if symlink:
            skip_reason = "symlink"
        elif info.is_dir():
            skip_reason = "directory"
        elif nested:
            skip_reason = "nested_archive"
        elif not _is_selectable_for_framework(path, framework):
            skip_reason = "unsupported_extension"

        result.compressed_bytes += info.compress_size
        result.expanded_bytes += info.file_size
        if skip_reason is None and info.file_size > limits.max_entry_bytes:
            raise ArchiveValidationError(f"Archive entry exceeds the per-file limit: {path}")
        if result.expanded_bytes > limits.max_expanded_bytes:
            raise ArchiveValidationError("Archive expanded size exceeds the configured limit")
        if skip_reason is None and info.file_size and info.compress_size == 0:
            raise ArchiveValidationError(f"Invalid compression metadata: {path}")
        if skip_reason is None and info.compress_size and info.file_size / info.compress_size > limits.max_compression_ratio:
            raise ArchiveValidationError(f"Compression ratio exceeds the configured limit: {path}")

        result.entries.append(ArchiveEntry(
            path=path,
            compressed_size=info.compress_size,
            expanded_size=info.file_size,
            is_dir=info.is_dir(),
            is_symlink=symlink,
            is_nested_archive=nested,
            selected=skip_reason is None,
            skip_reason=skip_reason,
        ))

    if nested_depth > limits.max_nested_archive_depth:
        raise ArchiveValidationError("Nested archive depth exceeds the configured limit")
    if limits.reject_nested_archives and any(entry.is_nested_archive for entry in result.entries):
        raise ArchiveValidationError("Nested archives are not accepted for analysis")
    if any(entry.is_nested_archive for entry in result.entries):
        result.warnings.append("Nested archives were skipped and were not recursively extracted")
    return result