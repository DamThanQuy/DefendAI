"""Service quét source code từ file ZIP/RAR và gọi AI review."""
from __future__ import annotations

import hashlib
import json
import logging
import re
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path, PurePosixPath
from typing import Any, AsyncIterator, Iterable

from app.models.entities import DocType, Document
from app.services.ai_client import ai_gateway
from app.core.config import settings
from app.services.storage import get_doc, iter_zip_members


try:
    import rarfile
except ImportError:  # pragma: no cover
    rarfile = None  # type: ignore


logger = logging.getLogger(__name__)

# Code thật — đủ để kết luận "có source code"
REAL_CODE_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".go", ".rb",
    ".php", ".cs", ".c", ".cpp", ".h", ".html", ".css",
}

# Phân loại ngôn ngữ theo project type
FRONTEND_EXTENSIONS = {".tsx", ".jsx", ".vue", ".svelte", ".html", ".css"}
BACKEND_EXTENSIONS = {".py", ".java", ".go", ".cs", ".php", ".rb"}

# Cấu hình / dữ liệu — không tính là code thật
CONFIG_EXTENSIONS = {".json", ".yml", ".yaml", ".toml", ".xml", ".sql"}

# Tài liệu — không tính là code
DOC_EXTENSIONS = {".md", ".txt", ".pdf", ".docx", ".pptx", ".xlsx"}

# File manifest / khai báo dự án
MANIFEST_FILES = {
    "package.json", "requirements.txt", "pyproject.toml", "go.mod",
    "pom.xml", "build.gradle", "composer.json", "Cargo.toml",
}

# Thư mục "code thật" — file nằm trong các folder này được ưu tiên source code
SOURCE_DIR_MARKERS = (
    "/src/", "/app/", "/lib/", "/pages/", "/components/",
    "/api/", "/services/", "/routers/", "/handlers/", "/controllers/",
    "/models/", "/utils/", "/hooks/", "/features/",
)

# Ngưỡng phân loại
CLEAR_RATIO = 0.20      # Real Code > 20% → rõ ràng
AMBIGUOUS_RATIO = 0.05  # Real Code < 5% → nghi ngờ tài liệu
SOURCE_DIR_BONUS = 0.10  # Cộng thêm nếu có ≥ 1 file trong SOURCE_DIR_MARKERS

ALLOWED_CODE_EXTENSIONS = REAL_CODE_EXTENSIONS | CONFIG_EXTENSIONS | DOC_EXTENSIONS

SKIP_DIR_NAMES = {
    ".git",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "target",
    "__pycache__",
    ".next",
    "venv",
    ".venv",
    # Data directories (MinIO/RAR/ZIP files nhúng trong repo - không phải source)
    "data",
    "minio",
}

# File quá lớn - skip để tránh OOM
# Threshold: 5MB per file. Source code thật thường < 500KB.
MAX_MEMBER_SIZE = 5 * 1024 * 1024  # 5MB

# Đề xuất 4 (NotebookLM): bỏ qua lockfile / minified / generated / type declaration
SKIP_FILE_NAMES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "composer.lock",
    "pipfile.lock", "poetry.lock", "cargo.lock", "go.sum",
    ".gitignore", ".gitkeep", ".dockerignore",
    ".eslintrc", ".prettierrc", ".editorconfig",
}
SKIP_SUFFIXES = {
    ".min.js", ".min.css", ".bundle.js", ".chunk.js", ".min.mjs",
}
GENERATED_PATH_MARKERS = (
    "/dist/", "/build/", "/out/", "/.next/", "/.nuxt/",
    "/coverage/", "/__snapshots__/", "/generated/", "/.generated/",
    "/_generated/", "/autogen/",
)

MAX_ZIP_FILES = 100000  # 100k, align with 100k-file goal
# ponytail: removed hard cap on extract (was 50). Orchestrator reads ALL files then
# splits into modules <= MODULE_FILE_CAP for 1 LLM call each. Upgrade path: 100k files.
MAX_SCAN_FILES = 100000
MODULE_FILE_CAP = 40  # files per module job -> ~40*5000=200K chars <= MAX_TOTAL_CHARS
MAX_TOTAL_UNCOMPRESSED_BYTES = 10 * 1024 * 1024 * 1024  # 10GB, align with upload cap
MAX_FILE_CHARS = 5000
MAX_TOTAL_CHARS = 200000
CONTEXT_OVERFLOW_THRESHOLD = 150000  # switch to multi-pass when total chars exceed this


class CodeScanError(Exception):
    """Raised when code scan cannot proceed."""


@dataclass(slots=True)
class ScannedFile:
    path: str
    content: str


def _module_content_hash(module_files: list[ScannedFile]) -> str:
    """Đề xuất 1: SHA256 tổng hợp (path + content) để cache LLM result theo module.

    Sort theo path để deterministic — cùng tập file luôn cho cùng hash
    bất kể thứ tự enumerate trong ZIP.
    """
    h = hashlib.sha256()
    for f in sorted(module_files, key=lambda x: x.path):
        h.update(f.path.encode("utf-8"))
        h.update(b"\x00")
        h.update(f.content.encode("utf-8", errors="replace"))
        h.update(b"\x00")
    return h.hexdigest()


def _is_static_or_generated(name: str) -> bool:
    """Đề xuất 4: bỏ file minified, generated, lockfile, type declaration trước LLM.
    Trả True nếu KHÔNG cần đưa vào review.
    """
    lower_name = name.lower()
    base = PurePosixPath(lower_name).name
    if base in SKIP_FILE_NAMES:
        return True
    if any(lower_name.endswith(s) for s in SKIP_SUFFIXES):
        return True
    if any(marker in lower_name for marker in GENERATED_PATH_MARKERS):
        return True
    return False


def _is_safe_member(name: str, size: int | None = None) -> bool:
    path = PurePosixPath(name)
    if path.is_absolute():
        return False
    if ".." in path.parts:
        return False
    if any(part in SKIP_DIR_NAMES for part in path.parts):
        return False
    if _is_static_or_generated(name):
        return False
    if size is not None and size > MAX_MEMBER_SIZE:
        return False
    return True


def _sort_key(file: ScannedFile) -> tuple[int, str]:
    priority = {
        ".py": 0,
        ".ts": 1,
        ".tsx": 1,
        ".js": 2,
        ".jsx": 2,
        ".java": 3,
        ".go": 4,
        ".cs": 5,
        ".php": 6,
        ".rb": 7,
        ".c": 8,
        ".cpp": 8,
        ".h": 8,
        ".html": 9,
        ".css": 10,
        ".json": 11,
        ".yml": 12,
        ".yaml": 12,
        ".md": 13,
    }
    return priority.get(Path(file.path).suffix.lower(), 99), file.path.lower()


async def list_archive_members(document: Document) -> list[str]:
    """Đọc danh sách member (path) đã lọc artifact, không giải nén toàn bộ.

    STREAMING: chỉ load central directory, không giải nén từng file. Memory ~50MB
    thay vì load full ZIP 2.7GB+ vào RAM. Dùng storage.iter_zip_member_names().
    """
    if document.doc_type != DocType.ZIP:
        raise CodeScanError("Code review chỉ hỗ trợ file .zip / .rar source code")

    # Streaming: chỉ lấy path, không load full body
    from app.services.storage import iter_zip_member_names

    members: list[str] = []
    async for path in iter_zip_member_names(
        bucket=settings.minio.bucket,
        key=document.storage_key,
        safe_filter=_is_safe_member,
    ):
        members.append(path)
    return members


def classify_archive(members: list[str]) -> dict:
    """Phân loại file nén: có phải source code dự án không.

    Trả về đầy đủ thông tin để caller quyết định:
    - code_ratio / byte_ratio: tỉ lệ file / byte code thật
    - has_manifest: có package.json, requirements.txt... ở bất kỳ đâu trong ZIP
    - has_source_dir: có file nằm trong src/ app/ lib/ ...
    - project_type: "frontend" | "backend" | "fullstack" | "unknown"
    - preview: 5 file code đầu tiên để user thấy hệ thống detect được gì
    """
    real_code = [m for m in members if PurePosixPath(m).suffix.lower() in REAL_CODE_EXTENSIONS]
    config = [m for m in members if PurePosixPath(m).suffix.lower() in CONFIG_EXTENSIONS]
    docs = [m for m in members if PurePosixPath(m).suffix.lower() in DOC_EXTENSIONS]

    # Manifest được tính ở bất kỳ đâu trong ZIP, không chỉ root
    has_manifest = any(PurePosixPath(m).name.lower() in MANIFEST_FILES for m in members)
    manifest_paths = [m for m in members if PurePosixPath(m).name.lower() in MANIFEST_FILES]

    # File nằm trong folder code thật (src/, app/, lib/...)
    # Check cả "/src/" (path có leading slash) và "src/" (path ở root zip)
    def _is_in_source_dir(path: str) -> bool:
        normalized = "/" + path if not path.startswith("/") else path
        return any(marker in normalized for marker in SOURCE_DIR_MARKERS)

    in_source_dir = [m for m in real_code if _is_in_source_dir(m)]
    has_source_dir = len(in_source_dir) > 0

    # Project type
    suffixes = {PurePosixPath(m).suffix.lower() for m in real_code}
    is_frontend = bool(suffixes & FRONTEND_EXTENSIONS)
    is_backend = bool(suffixes & BACKEND_EXTENSIONS)
    if is_frontend and is_backend:
        project_type = "fullstack"
    elif is_frontend:
        project_type = "frontend"
    elif is_backend:
        project_type = "backend"
    else:
        project_type = "unknown"

    total = len(members)
    ratio = len(real_code) / total if total else 0

    # Heuristic byte_ratio: dùng độ dài path làm proxy cho "độ nặng" tương đối
    # (file .tsx thường dài hơn file .json config). Tránh phải đọc lại từ MinIO.
    real_code_weight = sum(max(1, len(m)) for m in real_code)
    total_weight = sum(max(1, len(m)) for m in members)
    byte_ratio = real_code_weight / total_weight if total_weight else 0

    return {
        "member_names": members,
        "real_code_count": len(real_code),
        "config_count": len(config),
        "doc_count": len(docs),
        "total": total,
        "has_manifest": has_manifest,
        "manifest_paths": manifest_paths[:3],  # 3 manifest đầu tiên
        "has_source_dir": has_source_dir,
        "code_ratio": round(ratio, 4),
        "byte_ratio": round(byte_ratio, 4),
        "project_type": project_type,
        "preview": real_code[:5],  # 5 file code đầu tiên
    }


def decide_source_code(classification: dict) -> str:
    """Trả về: 'pass' | 'ambiguous' | 'reject'.

    Quy tắc (đã nâng cấp):
    - Không có file code nào → reject
    - Có manifest ở bất kỳ đâu HOẶC có file trong src/app/lib...
      HOẶC code_ratio > 20% HOẶC byte_ratio > 20% → pass
    - Cả code_ratio < 5% VÀ byte_ratio < 5% → reject
    - Còn lại → ambiguous (để AI agent phán xét)
    """
    real = classification.get("real_code_count", 0)
    ratio = classification.get("code_ratio", 0)
    byte_ratio = classification.get("byte_ratio", 0)
    has_manifest = classification.get("has_manifest", False)
    has_source_dir = classification.get("has_source_dir", False)

    if real == 0:
        return "reject"

    # Điểm tổng hợp — manifest hoặc source-dir là tín hiệu mạnh
    if has_manifest or has_source_dir:
        return "pass"

    effective_ratio = max(ratio, byte_ratio)
    if effective_ratio > CLEAR_RATIO:
        return "pass"

    if effective_ratio < AMBIGUOUS_RATIO:
        return "reject"

    return "ambiguous"


async def extract_code_files(document: Document) -> list[ScannedFile]:
    """Read ZIP/RAR from MinIO, extract code files. async.

    ⚠️ DEPRECATED cho file > 1GB: Load toàn bộ vào RAM. Dùng `iter_code_files()`
    thay thế để xử lý streaming (memory ~50MB thay vì vài GB).
    Hàm này vẫn được giữ để tương thích ngược & cho file nhỏ.
    """
    if document.doc_type != DocType.ZIP:
        raise CodeScanError("Code review chỉ hỗ trợ file .zip / .rar source code")

    storage_key = document.storage_key

    raw = await get_doc(storage_key, bucket=settings.minio.bucket)
    if not raw:
        raise CodeScanError(f"File not found in MinIO: {storage_key}")

    if raw[:8].startswith(b"Rar!\x1a\x07"):
        return _extract_from_rar(raw)
    return _extract_from_zip(raw)


async def iter_code_files(
    document: Document,
    max_files: int = MAX_SCAN_FILES,
) -> "AsyncIterator[ScannedFile]":
    """Streaming extract code files từ ZIP trên MinIO. Memory tối đa ~50MB.

    Khác với `extract_code_files` (load toàn bộ ZIP vào RAM):
    - Download ZIP từ MinIO vào file tạm trên disk (không tốn RAM)
    - Extract từng member một, yield ngay ra caller
    - Caller (orchestrator) có thể xử lý incremental: ghi DB, tạo job LLM, ...

    Phù hợp với file ZIP 2-10GB (vd: cả source DefendAI.zip = 4.3GB uncompressed).

    Yields:
        ScannedFile(path, content) — content đã decode thành text.

    Raises:
        CodeScanError: nếu file không phải ZIP hợp lệ hoặc quá nhiều file.
    """
    if document.doc_type != DocType.ZIP:
        raise CodeScanError("Code review chỉ hỗ trợ file .zip / .rar source code")

    storage_key = document.storage_key

    # Stream extract qua storage.iter_zip_members:
    #   1. Download từng 8MB chunk từ MinIO → ghi vào file tạm trên disk
    #   2. Parse ZIP từ file tạm (chỉ central directory ở cuối được load 1 lần)
    #   3. Extract từng member → yield, giải phóng memory ngay
    file_count = 0
    total_uncompressed = 0
    found_any = False

    async for path, member_raw in iter_zip_members(
        bucket=settings.minio.bucket,
        key=storage_key,
        extensions=ALLOWED_CODE_EXTENSIONS,
        safe_filter=_is_safe_member,
    ):
        file_count += 1
        if file_count > max_files:
            logger.warning("Reached MAX_SCAN_FILES=%d, stop", max_files)
            break

        total_uncompressed += len(member_raw)
        if total_uncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES:
            raise CodeScanError("ZIP giải nén vượt ngưỡng an toàn")

        scanned_file = _make_scanned_file(path, member_raw)
        if not scanned_file.content:
            continue
        found_any = True
        yield scanned_file

    if not found_any:
        raise CodeScanError("Không tìm thấy file code phù hợp trong ZIP")

    logger.info(
        "Streamed %d files from %s (%.1f MB uncompressed)",
        file_count, storage_key, total_uncompressed / 1024 / 1024
    )


async def collect_code_files(
    document: Document,
    max_files: int = MAX_SCAN_FILES,
) -> list[ScannedFile]:
    """Helper: collect tất cả ScannedFile từ iter_code_files() vào list + sort.

    Dùng khi caller CẦN full list (vd: classify_archive, _read_top_snippets).
    Vẫn load toàn bộ vào RAM, nhưng code path dùng streaming generator → dễ
    migrate từng phần sang fully-streaming.

    Memory: tổng content của tất cả file (≈ uncompressed size của ZIP).
    Với file 4GB uncompressed, cần ~4GB RAM.
    """
    files: list[ScannedFile] = []
    async for sf in iter_code_files(document, max_files=max_files):
        files.append(sf)
    return sorted(files, key=_sort_key)


def _extract_from_zip(raw: bytes) -> list[ScannedFile]:
    """Giải nén code từ ZIP bytes."""
    scanned: list[ScannedFile] = []
    total_uncompressed = 0

    try:
        with zipfile.ZipFile(BytesIO(raw)) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_ZIP_FILES:
                raise CodeScanError(f"ZIP contains too many files ({len(infos)} > {MAX_ZIP_FILES})")

            for info in infos:
                if info.is_dir():
                    continue
                if not _is_safe_member(info.filename):
                    continue

                total_uncompressed += info.file_size
                if total_uncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES:
                    raise CodeScanError("ZIP giải nén vượt ngưỡng an toàn")

                suffix = PurePosixPath(info.filename).suffix.lower()
                if suffix not in ALLOWED_CODE_EXTENSIONS:
                    continue

                try:
                    member_raw = archive.read(info)
                except Exception as exc:
                    logger.warning("Failed to read zip member %s: %s", info.filename, exc)
                    continue

                scanned_file = _make_scanned_file(info.filename, member_raw)
                if not scanned_file.content:
                    continue
                scanned.append(scanned_file)

                if len(scanned) >= MAX_SCAN_FILES:
                    break
    except zipfile.BadZipFile as exc:
        raise CodeScanError("File ZIP bị lỗi hoặc không thể giải nén") from exc

    if not scanned:
        raise CodeScanError("Không tìm thấy file code phù hợp trong ZIP")

    return sorted(scanned, key=_sort_key)


def _extract_from_rar(raw: bytes) -> list[ScannedFile]:
    """Giải nén code từ RAR bytes."""
    if rarfile is None:
        raise CodeScanError("Chưa cài thư viện rarfile để đọc file .rar")

    scanned: list[ScannedFile] = []
    total_uncompressed = 0

    try:
        with rarfile.RarFile(BytesIO(raw)) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_ZIP_FILES:
                raise CodeScanError(f"RAR contains too many files ({len(infos)} > {MAX_ZIP_FILES})")

            for info in infos:
                if info.isdir():
                    continue
                if not _is_safe_member(info.filename):
                    continue

                total_uncompressed += info.file_size
                if total_uncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES:
                    raise CodeScanError("RAR giải nén vượt ngưỡng an toàn")

                suffix = PurePosixPath(info.filename).suffix.lower()
                if suffix not in ALLOWED_CODE_EXTENSIONS:
                    continue

                try:
                    member_raw = archive.read(info)
                except Exception as exc:
                    logger.warning("Failed to read rar member %s: %s", info.filename, exc)
                    continue

                scanned_file = _make_scanned_file(info.filename, member_raw)
                if not scanned_file.content:
                    continue
                scanned.append(scanned_file)

                if len(scanned) >= MAX_SCAN_FILES:
                    break
    except rarfile.RarCannotExec as exc:
        raise CodeScanError(
            "Không tìm thấy chương trình unrar để giải nén. Hệ thống chỉ hỗ trợ RAR4 không mã hóa."
        ) from exc
    except rarfile.Error as exc:
        raise CodeScanError("File RAR bị lỗi hoặc không thể giải nén") from exc

    if not scanned:
        raise CodeScanError("Không tìm thấy file code phù hợp trong RAR")

    return sorted(scanned, key=_sort_key)


def _make_scanned_file(path: str, raw: bytes) -> ScannedFile:
    """Decode raw bytes thành text cho ScannedFile."""
    if b"\x00" in raw:
        return ScannedFile(path=path, content="")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1", errors="replace")
    text = text.strip()
    return ScannedFile(path=path, content=text)


def _numbered_lines(text: str, max_chars: int = MAX_FILE_CHARS) -> str:
    lines = text.splitlines()
    numbered: list[str] = []
    total = 0

    for index, line in enumerate(lines, start=1):
        rendered = f"{index:>4}: {line}"
        total += len(rendered) + 1
        if total > max_chars:
            numbered.append("[... truncated ...]")
            break
        numbered.append(rendered)

    return "\n".join(numbered)


def _rubric_block(rubric: dict | None) -> str:
    """Inject tiêu chí từ rubric (thước đo) vào system prompt thay hardcode."""
    if not rubric:
        return (
            "Hãy review source code, tìm bug, code smell, security issue, performance issue và thiếu validation.\n"
        )
    cats = rubric.get("categories", {})
    sev = rubric.get("severity_deduction", {})
    lines = ["Tiêu chí đánh giá (rubric chuẩn):"]
    for code, meta in cats.items():
        lines.append(f"- {code} ({meta.get('label', code)}): trọng số {meta.get('weight', 1)}")
    lines.append("Mức độ & điểm trừ (deduction):")
    for s, d in sev.items():
        lines.append(f"- {s}: -{d}")
    lines.append(
        'Phân loại mỗi issue vào đúng 1 `type` thuộc nhóm trên. '
        "Tính điểm tổng: score = max(100 - Σ(deduction), 0)."
    )
    # Yêu cầu đồ án SEP490 cần soi (features + business_rules)
    feats = rubric.get("features", [])
    brs = rubric.get("business_rules", [])
    if feats or brs:
        lines.append("Yêu cầu đồ án SEP490 cần soi:")
        for f in feats:
            lines.append(f"  - Tính năng {f['code']}: {f['desc']} (nếu thiếu → issue missing_requirement)")
        for b in brs[:12]:
            lines.append(f"  - BR {b['code']}: {b['desc']} (nếu vi phạm → issue security/logic_error)")
    return "\n".join(lines) + "\n"


def build_prompt(files: list[ScannedFile], rubric: dict | None = None) -> tuple[str, str, bool]:
    system_prompt = (
        "Bạn là một Senior Software Engineer và code reviewer rất khắt khe. "
        "Hãy review source code theo đúng tiêu chí dưới đây.\n"
        + _rubric_block(rubric)
        + "Chỉ trả về JSON object hợp lệ, không markdown, không giải thích ngoài JSON.\n\n"
        "Output schema:\n"
        "{\n"
        '  "summary": "string",\n'
        '  "issues": [\n'
        "    {\n"
        '      "type": "logic_error|code_smell|security|performance|convention|missing_requirement",\n'
        '      "file": "path/to/file.py",\n'
        '      "line": 12,\n'
        '      "description": "string",\n'
        '      "severity": "critical|high|medium|low|info",\n'
        '      "suggestion": "string"\n'
        "    }\n"
        "  ],\n"
        '  "strengths": ["string"],\n'
        '  "improvement_suggestions": ["string"]\n'
        "}\n"
    )

    chunks: list[str] = []
    total_chars = 0
    overflow = False
    for file in files:
        rendered = _numbered_lines(file.content)
        block = f"FILE: {file.path}\n```\n{rendered}\n```"
        total_chars += len(block)
        if total_chars > CONTEXT_OVERFLOW_THRESHOLD:
            overflow = True
            break
        chunks.append(block)

    user_prompt = (
        "Source code dự án (đã được parse thành text):\n\n"
        + "\n\n---\n\n".join(chunks)
        + "\n\nHãy review code và phát hiện issues. Output ONLY valid JSON."
    )
    return system_prompt, user_prompt, overflow


def _extract_json_payload(content: str) -> dict[str, Any]:
    text = content.strip()
    # combo-3 (stepfun) emits a free-text reasoning preamble before the JSON object.
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Greedy bracket capture also drops any leading reasoning / trailing prose.
        match = re.search(r"[\{\[].*[\}\]]", text, flags=re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


def _normalize_severity(value: str | None) -> str:
    normalized = (value or "medium").strip().lower()
    if normalized in {"critical", "high", "medium", "low", "info"}:
        return normalized
    if normalized in {"error", "fatal"}:
        return "high"
    if normalized in {"warning", "warn"}:
        return "medium"
    return "info"


def _normalize_issue(item: dict[str, Any], index: int) -> dict[str, Any] | None:
    try:
        file_name = str(item.get("file") or item.get("path") or "unknown")
        line = int(item.get("line") or 1)
        return {
            "id": index,
            "type": str(item.get("type") or "code_smell"),
            "file": file_name,
            "line": max(line, 1),
            "description": str(item.get("description") or item.get("message") or ""),
            "severity": _normalize_severity(item.get("severity")),
            "suggestion": str(item.get("suggestion") or ""),
        }
    except Exception:
        return None


def _heuristic_scan(files: list[ScannedFile]) -> dict[str, Any]:
    patterns = [
        (
            "security",
            "high",
            re.compile(r"(?i)\b(api[_-]?key|secret|password|token)\b\s*[:=]\s*['\"]([^'\"]+)['\"]"),
            "Có khả năng hardcode secret hoặc credential trong source code.",
            "Di chuyển secret sang environment variables hoặc secret manager.",
            "security",
        ),
        (
            "security",
            "high",
            re.compile(r"\b(eval|exec|os\.system|subprocess\.run)\s*\("),
            "Có đoạn code thực thi lệnh hoặc expression động, cần review rất kỹ.",
            "Hạn chế dùng execution động; nếu bắt buộc hãy validate input và sandbox chặt.",
            "security",
        ),
        (
            "code_smell",
            "medium",
            re.compile(r"(?i)\b(TODO|FIXME|HACK)\b"),
            "Còn marker TODO/FIXME/HACK trong code.",
            "Xử lý hoặc tạo ticket rõ ràng trước khi merge.",
            "code_smell",
        ),
        (
            "code_smell",
            "info",
            re.compile(r"\b(console\.log|print)\s*\("),
            "Có log/debug statement có thể làm nhiễu output hoặc lộ thông tin.",
            "Giữ logging có kiểm soát hoặc loại bỏ debug log trước khi release.",
            "code_smell",
        ),
        (
            "logic_error",
            "medium",
            re.compile(r"^\s*except\s*:\s*$|^\s*catch\s*\(\s*\)\s*\{", re.MULTILINE),
            "Có thể đang bắt lỗi quá rộng, dễ che mất exception thật.",
            "Bắt exception cụ thể hơn và log rõ ngữ cảnh lỗi.",
            "logic_error",
        ),
    ]

    issues: list[dict[str, Any]] = []
    seen: set[tuple[str, int, str]] = set()

    for file in files:
        for line_number, line in enumerate(file.content.splitlines(), start=1):
            for issue_type, severity, pattern, description, suggestion, normalized_type in patterns:
                if not pattern.search(line):
                    continue
                key = (file.path, line_number, normalized_type)
                if key in seen:
                    continue
                seen.add(key)
                issues.append(
                    {
                        "id": len(issues) + 1,
                        "type": issue_type,
                        "file": file.path,
                        "line": line_number,
                        "description": description,
                        "severity": severity,
                        "suggestion": suggestion,
                    }
                )

    summary = (
        f"Phát hiện {len(issues)} vấn đề từ {len(files)} file code. "
        "Kết quả này được tạo bằng heuristic fallback do AI provider chưa sẵn sàng."
    )

    return {
        "summary": summary,
        "issues": issues,
        "provider": "heuristic",
        "model": "rules-v1",
    }


def _module_of_path(path: str) -> str:
    parts = Path(path).parts
    return parts[0] if len(parts) > 1 else "shared"


def _split_by_module(files: list[ScannedFile]) -> dict[str, list[ScannedFile]]:
    modules: dict[str, list[ScannedFile]] = {}
    for file in files:
        modules.setdefault(_module_of_path(file.path), []).append(file)
    return modules


def _split_into_module_jobs(
    files: list[ScannedFile],
    module_cap: int = 40,
    small_threshold: int = 5,
) -> list[tuple[str, list[ScannedFile]]]:
    """Group files by top-level folder, gộp module nhỏ vào ``__shared__`` (Đề xuất 2).

    Lý do: dự án có nhiều folder rời rạc (vd: utils/, helpers/, types/, configs/)
    chỉ chứa 1-3 file → tạo hàng chục job LLM call riêng lẻ → lãng phí. Gom
    các folder có ``< small_threshold` file vào bucket ``__shared__`` giúp giảm
    30-40% số LLM call cho các project có cấu trúc dạng này.

    Returns ``[(module_name, [ScannedFile, ...]), ...]`` — one LLM job per tuple.
    """
    grouped: dict[str, list[ScannedFile]] = _split_by_module(files)

    big_modules: dict[str, list[ScannedFile]] = {}
    shared_files: list[ScannedFile] = []
    for module_name, module_files in grouped.items():
        if len(module_files) >= small_threshold:
            big_modules[module_name] = module_files
        else:
            shared_files.extend(module_files)

    jobs: list[tuple[str, list[ScannedFile]]] = []
    for module_name, module_files in big_modules.items():
        for i in range(0, len(module_files), module_cap):
            chunk = module_files[i : i + module_cap]
            suffix = f"::{i // module_cap + 1}" if len(module_files) > module_cap else ""
            jobs.append((f"{module_name}{suffix}", chunk))

    if shared_files:
        shared_files.sort(key=_sort_key)
        for i in range(0, len(shared_files), module_cap):
            chunk = shared_files[i : i + module_cap]
            suffix = f"::{i // module_cap + 1}" if len(shared_files) > module_cap else ""
            jobs.append((f"__shared__{suffix}", chunk))
    return jobs


async def analyze_module_files(
    files: list[ScannedFile],
    provider: str | None = None,
    model: str | None = None,
    rubric: dict | None = None,
) -> list[dict[str, Any]]:
    """1 LLM pass over a module's files (≤ MODULE_FILE_CAP). Returns normalized issues."""
    if not files:
        return []
    # Provider/model: ưu tiên tham số truyền vào, fallback cấu hình chức năng code_review
    if not provider or not model:
        from app.core.database import async_session_maker
        from app.services.feature_ai import resolve_feature_ai
        async with async_session_maker() as db:
            f_provider, f_model = await resolve_feature_ai(db, "code_review")
        provider = provider or f_provider
        model = model or f_model
    system_prompt, user_prompt, _ = build_prompt(files, rubric=rubric)
    try:
        result = await ai_gateway.generate(
            prompt=user_prompt,
            provider=provider,
            model=model,
            system_prompt=system_prompt,
            temperature=0.15,
            max_tokens=3000,
        )
        payload = _extract_json_payload(result["content"])
        raw_issues = payload.get("issues") or []
        normalized: list[dict[str, Any]] = []
        for index, item in enumerate(raw_issues, start=1):
            if isinstance(item, dict):
                n = _normalize_issue(item, index)
                if n:
                    normalized.append(n)
        return normalized
    except Exception as exc:  # noqa: BLE001
        logger.warning("Module LLM scan failed, using heuristic: %s", exc)
        return _heuristic_scan(files).get("issues", [])


# ============================================================
# Agent Fast-Check — phân loại file nén mơ hồ (chỉ chạy khi ambiguous)
# ============================================================

def _build_tree_preview(classification: dict) -> str:
    """Danh sách path đã lọc → text tree cho LLM."""
    members = classification.get("member_names", [])
    if not members:
        return "(empty)"
    return "\n".join(members)


async def _read_top_snippets(document: Document, n: int = 3, max_chars: int = 2000) -> str:
    """Lấy n file code lớn nhất, mỗi file trích đầu ~max_chars ký tự."""
    try:
        files = sorted(
            await extract_code_files(document),
            key=lambda f: len(f.content),
            reverse=True,
        )[:n]
    except CodeScanError:
        return "(không đọc được snippet)"
    return "\n\n".join(f"--- {f.path} ---\n{f.content[:max_chars]}" for f in files)


async def agent_fast_check(document: Document, classification: dict) -> dict:
    """LLM đọc tree + snippet 2-3 file → trả JSON schema đầy đủ."""
    tree = _build_tree_preview(classification)
    snippets = await _read_top_snippets(document, n=3)
    provider, model = await _classify_provider_model()

    prompt = (
        "Đây là cấu trúc file nén của một đồ án sinh viên. "
        "Hãy xác định đây là SOURCE CODE dự án hay chỉ là TÀI LIỆU/NOISE.\n\n"
        f"Tree:\n{tree}\n\nSnippets:\n{snippets}\n\n"
        "Trả về JSON theo schema sau:\n"
        "{\n"
        '  "is_source_code": true | false,\n'
        '  "confidence_score": 0.0 -> 1.0,\n'
        '  "reason": "Giải thích ngắn gọn lý do (ví dụ: Phát hiện cấu trúc React App với các file Component và Route rõ ràng)",\n'
        '  "primary_language": "TypeScript / Python / Java..."\n'
        "}"
    )
    result = await ai_gateway.generate(prompt=prompt, temperature=0, provider=provider, model=model)
    payload = _extract_json_payload(result["content"])
    # Chuẩn hoá thiếu trường → không crash nơi gọi
    payload.setdefault("is_source_code", False)
    payload.setdefault("confidence_score", 0.5)
    payload.setdefault("reason", "")
    payload.setdefault("primary_language", "")
    return payload


async def _classify_provider_model() -> tuple[str | None, str | None]:
    """Resolve provider/model cho agent_fast_check (chức năng classify)."""
    from app.core.database import async_session_maker
    from app.services.feature_ai import resolve_feature_ai
    async with async_session_maker() as db:
        return await resolve_feature_ai(db, "classify")