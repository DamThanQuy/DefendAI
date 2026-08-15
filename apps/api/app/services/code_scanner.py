"""Service quét source code từ file ZIP/RAR và gọi AI review."""
from __future__ import annotations

import json
import logging
import re
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

from app.models.entities import DocType, Document
from app.services.ai_client import ai_gateway
from app.core.config import settings
from app.services.storage import get_doc


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

# Cấu hình / dữ liệu — không tính là code thật
CONFIG_EXTENSIONS = {".json", ".yml", ".yaml", ".toml", ".xml", ".sql"}

# Tài liệu — không tính là code
DOC_EXTENSIONS = {".md", ".txt", ".pdf", ".docx", ".pptx", ".xlsx"}

# File manifest / khai báo dự án
MANIFEST_FILES = {
    "package.json", "requirements.txt", "pyproject.toml", "go.mod",
    "pom.xml", "build.gradle", "composer.json", "Cargo.toml",
}

# Ngưỡng phân loại
CLEAR_RATIO = 0.20      # Real Code > 20% → rõ ràng
AMBIGUOUS_RATIO = 0.05  # Real Code < 5% → nghi ngờ tài liệu

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
}

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


def _is_safe_member(name: str) -> bool:
    path = PurePosixPath(name)
    if path.is_absolute():
        return False
    if ".." in path.parts:
        return False
    if any(part in SKIP_DIR_NAMES for part in path.parts):
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
    """Đọc danh sách member (path) đã lọc artifact, không giải nén toàn bộ."""
    if document.doc_type != DocType.ZIP:
        raise CodeScanError("Code review chỉ hỗ trợ file .zip / .rar source code")

    raw = await get_doc(document.storage_key, bucket=settings.minio.bucket)
    if not raw:
        raise CodeScanError(f"File not found in MinIO: {document.storage_key}")

    if raw[:8].startswith(b"Rar!\x1a\x07"):
        if rarfile is None:
            raise CodeScanError("Chưa cài thư viện rarfile để đọc file .rar")
        with rarfile.RarFile(BytesIO(raw)) as archive:
            return [i.filename for i in archive.infolist() if not i.isdir() and _is_safe_member(i.filename)]

    with zipfile.ZipFile(BytesIO(raw)) as archive:
        return [i.filename for i in archive.infolist() if not i.is_dir() and _is_safe_member(i.filename)]


def classify_archive(members: list[str]) -> dict:
    """Phân loại file nén: có phải source code dự án không."""
    real_code = [m for m in members if PurePosixPath(m).suffix.lower() in REAL_CODE_EXTENSIONS]
    config = [m for m in members if PurePosixPath(m).suffix.lower() in CONFIG_EXTENSIONS]
    docs = [m for m in members if PurePosixPath(m).suffix.lower() in DOC_EXTENSIONS]

    has_manifest = any(PurePosixPath(m).name.lower() in MANIFEST_FILES for m in members)
    total = len(members)
    ratio = len(real_code) / total if total else 0

    return {
        "member_names": members,
        "real_code_count": len(real_code),
        "config_count": len(config),
        "doc_count": len(docs),
        "total": total,
        "has_manifest": has_manifest,
        "code_ratio": ratio,
    }


def decide_source_code(classification: dict) -> str:
    """Trả về: 'pass' | 'ambiguous' | 'reject'."""
    real = classification["real_code_count"]
    ratio = classification["code_ratio"]
    has_manifest = classification["has_manifest"]

    if real == 0:
        return "reject"
    if has_manifest or ratio > CLEAR_RATIO:
        return "pass"
    if ratio < AMBIGUOUS_RATIO:
        return "reject"
    return "ambiguous"


async def extract_code_files(document: Document) -> list[ScannedFile]:
    """Read ZIP/RAR from MinIO, extract code files. async."""
    if document.doc_type != DocType.ZIP:
        raise CodeScanError("Code review chỉ hỗ trợ file .zip / .rar source code")

    storage_key = document.storage_key

    raw = await get_doc(storage_key, bucket=settings.minio.bucket)
    if not raw:
        raise CodeScanError(f"File not found in MinIO: {storage_key}")

    if raw[:8].startswith(b"Rar!\x1a\x07"):
        return _extract_from_rar(raw)
    return _extract_from_zip(raw)


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


def _split_into_module_jobs(files: list[ScannedFile], module_cap: int = 40) -> list[tuple[str, list[ScannedFile]]]:
    """Group files by top-level folder then chunk each group to ``module_cap`` files.

    Returns ``[(module_name, [ScannedFile, ...]), ...]`` — one LLM job per tuple.
    """
    grouped: dict[str, list[ScannedFile]] = _split_by_module(files)
    jobs: list[tuple[str, list[ScannedFile]]] = []
    for module_name, module_files in grouped.items():
        for i in range(0, len(module_files), module_cap):
            chunk = module_files[i : i + module_cap]
            suffix = f"::{i // module_cap + 1}" if len(module_files) > module_cap else ""
            jobs.append((f"{module_name}{suffix}", chunk))
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
    result = await ai_gateway.generate(prompt=prompt, temperature=0)
    payload = _extract_json_payload(result["content"])
    # Chuẩn hoá thiếu trường → không crash nơi gọi
    payload.setdefault("is_source_code", False)
    payload.setdefault("confidence_score", 0.5)
    payload.setdefault("reason", "")
    payload.setdefault("primary_language", "")
    return payload