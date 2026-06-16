"""Service quét source code từ file ZIP và gọi AI review."""
from __future__ import annotations

import json
import logging
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

from app.models.entities import DocType, Document
from app.services.ai_client import ai_gateway


logger = logging.getLogger(__name__)

ALLOWED_CODE_EXTENSIONS = {
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".java",
    ".go",
    ".rb",
    ".php",
    ".cs",
    ".cpp",
    ".c",
    ".h",
    ".html",
    ".css",
    ".json",
    ".yml",
    ".yaml",
    ".md",
}

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

MAX_ZIP_FILES = 500
MAX_SCAN_FILES = 50
MAX_TOTAL_UNCOMPRESSED_BYTES = 20 * 1024 * 1024
MAX_FILE_CHARS = 5000
MAX_TOTAL_CHARS = 200000


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


def extract_code_files(document: Document) -> list[ScannedFile]:
    if document.doc_type != DocType.ZIP:
        raise CodeScanError("Code review chỉ hỗ trợ file .zip source code")

    zip_path = Path(document.file_path)
    if not zip_path.exists():
        raise CodeScanError(f"File not found on disk: {zip_path}")

    scanned: list[ScannedFile] = []
    total_uncompressed = 0

    try:
        with zipfile.ZipFile(zip_path) as archive:
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
                    raw = archive.read(info)
                except Exception as exc:
                    logger.warning("Failed to read zip member %s: %s", info.filename, exc)
                    continue

                if b"\x00" in raw:
                    continue

                try:
                    text = raw.decode("utf-8")
                except UnicodeDecodeError:
                    text = raw.decode("latin-1", errors="replace")

                text = text.strip()
                if not text:
                    continue

                scanned.append(ScannedFile(path=info.filename, content=text))

                if len(scanned) >= MAX_SCAN_FILES:
                    break
    except zipfile.BadZipFile as exc:
        raise CodeScanError("File ZIP bị lỗi hoặc không thể giải nén") from exc

    if not scanned:
        raise CodeScanError("Không tìm thấy file code phù hợp trong ZIP")

    return sorted(scanned, key=_sort_key)


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


def build_prompt(files: list[ScannedFile]) -> tuple[str, str]:
    system_prompt = (
        "Bạn là một Senior Software Engineer và code reviewer rất khắt khe. "
        "Hãy review source code, tìm bug, code smell, security issue, performance issue và thiếu validation. "
        "Chỉ trả về JSON object hợp lệ, không markdown, không giải thích ngoài JSON.\n\n"
        "Output schema:\n"
        "{\n"
        '  "summary": "string",\n'
        '  "pass_rate": 0-100,\n'
        '  "issues": [\n'
        "    {\n"
        '      "type": "logic_error|code_smell|security|performance",\n'
        '      "file": "path/to/file.py",\n'
        '      "line": 12,\n'
        '      "description": "string",\n'
        '      "severity": "critical|high|medium|low|info",\n'
        '      "suggestion": "string"\n'
        "    }\n"
        "  ],\n"
        '  "strengths": ["string"],\n'
        '  "improvement_suggestions": ["string"]\n'
        "}"
    )

    chunks: list[str] = []
    total_chars = 0
    for file in files:
        rendered = _numbered_lines(file.content)
        block = f"FILE: {file.path}\n```\n{rendered}\n```"
        total_chars += len(block)
        if total_chars > MAX_TOTAL_CHARS:
            break
        chunks.append(block)

    user_prompt = (
        "Source code dự án (đã được parse thành text):\n\n"
        + "\n\n---\n\n".join(chunks)
        + "\n\nHãy review code và phát hiện issues. Output ONLY valid JSON."
    )
    return system_prompt, user_prompt


def _extract_json_payload(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
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

    penalty = 0
    for issue in issues:
        penalty += {
            "critical": 14,
            "high": 10,
            "medium": 6,
            "low": 3,
            "info": 1,
        }.get(issue["severity"], 5)

    pass_rate = max(100 - penalty, 0)
    summary = (
        f"Phát hiện {len(issues)} vấn đề từ {len(files)} file code. "
        "Kết quả này được tạo bằng heuristic fallback do AI provider chưa sẵn sàng."
    )

    return {
        "summary": summary,
        "pass_rate": pass_rate,
        "issues": issues,
        "provider": "heuristic",
        "model": "rules-v1",
    }


async def analyze_code_document(document: Document, provider: str | None = None, model: str | None = None) -> dict[str, Any]:
    files = extract_code_files(document)
    system_prompt, user_prompt = build_prompt(files)

    try:
        result = await ai_gateway.generate(
            prompt=user_prompt,
            provider=provider,
            model=model,
            system_prompt=system_prompt,
            temperature=0.15,
            max_tokens=3000,
            response_format_json=True,
        )
        payload = _extract_json_payload(result["content"])
        raw_issues = payload.get("issues") or []
        normalized_issues: list[dict[str, Any]] = []
        for index, item in enumerate(raw_issues, start=1):
            if not isinstance(item, dict):
                continue
            normalized = _normalize_issue(item, index)
            if normalized:
                normalized_issues.append(normalized)

        summary = str(payload.get("summary") or f"Phân tích xong {len(files)} file code.")
        pass_rate = payload.get("pass_rate", payload.get("estimated_pass_rate", 0))
        try:
            pass_rate_value = float(pass_rate)
        except (TypeError, ValueError):
            pass_rate_value = 0.0

        return {
            "summary": summary,
            "pass_rate": max(min(pass_rate_value, 100.0), 0.0),
            "issues": normalized_issues,
            "provider": result["provider"],
            "model": result["model"],
        }
    except Exception as exc:
        logger.warning("AI code scan failed, falling back to heuristic scan: %s", exc)
        return _heuristic_scan(files)
