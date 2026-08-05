"""Service đọc nội dung file nén (ZIP/RAR) để hiển thị như GitHub file browser.

Khác với code_scanner (chỉ lấy file code cho AI review), service này:
- list_archive_members: liệt kê MỌI file (kể cả binary) thành cây thư mục
- read_archive_member: đọc bytes 1 file bất kỳ trong archive
"""
from __future__ import annotations

import logging
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePosixPath

from app.models.entities import DocType, Document
from app.core.config import settings
from app.services.storage import get_doc

try:
    import rarfile
except ImportError:  # pragma: no cover
    rarfile = None  # type: ignore

logger = logging.getLogger(__name__)

MAX_ARCHIVE_FILES = 2000
MAX_TOTAL_UNCOMPRESSED_BYTES = 200 * 1024 * 1024  # 200MB

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


class ArchiveError(Exception):
    """Lỗi khi đọc archive."""


@dataclass(slots=True)
class ArchiveMember:
    path: str
    size: int
    is_dir: bool


def _is_safe_member(name: str) -> bool:
    path = PurePosixPath(name)
    if path.is_absolute():
        return False
    if ".." in path.parts:
        return False
    if any(part in SKIP_DIR_NAMES for part in path.parts):
        return False
    return True


async def _load_raw(document: Document) -> bytes:
    if document.doc_type != DocType.ZIP:
        raise ArchiveError("Chỉ hỗ trợ xem nội dung file ZIP/RAR")
    raw = await get_doc(document.storage_key, bucket=settings.minio.bucket)
    if not raw:
        raise ArchiveError(f"File not found in MinIO: {document.storage_key}")
    return raw


def _is_rar(raw: bytes) -> bool:
    return raw[:8].startswith(b"Rar!\x1a\x07")


async def list_archive_members(document: Document) -> list[ArchiveMember]:
    """Liệt kê toàn bộ file/folder trong archive (không lọc theo extension)."""
    raw = await _load_raw(document)
    if _is_rar(raw):
        return _list_rar(raw)
    return _list_zip(raw)


def _list_zip(raw: bytes) -> list[ArchiveMember]:
    members: list[ArchiveMember] = []
    total = 0
    try:
        with zipfile.ZipFile(BytesIO(raw)) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_ARCHIVE_FILES:
                raise ArchiveError(f"ZIP chứa quá nhiều file ({len(infos)} > {MAX_ARCHIVE_FILES})")
            for info in infos:
                if not _is_safe_member(info.filename):
                    continue
                total += info.file_size
                if total > MAX_TOTAL_UNCOMPRESSED_BYTES:
                    raise ArchiveError("ZIP giải nén vượt ngưỡng an toàn")
                members.append(ArchiveMember(
                    path=info.filename,
                    size=info.file_size,
                    is_dir=info.is_dir(),
                ))
    except zipfile.BadZipFile as exc:
        raise ArchiveError("File ZIP bị lỗi hoặc không thể giải nén") from exc
    return members


def _list_rar(raw: bytes) -> list[ArchiveMember]:
    if rarfile is None:
        raise ArchiveError("Chưa cài thư viện rarfile để đọc file .rar")
    members: list[ArchiveMember] = []
    total = 0
    try:
        with rarfile.RarFile(BytesIO(raw)) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_ARCHIVE_FILES:
                raise ArchiveError(f"RAR chứa quá nhiều file ({len(infos)} > {MAX_ARCHIVE_FILES})")
            for info in infos:
                if not _is_safe_member(info.filename):
                    continue
                total += info.file_size
                if total > MAX_TOTAL_UNCOMPRESSED_BYTES:
                    raise ArchiveError("RAR giải nén vượt ngưỡng an toàn")
                members.append(ArchiveMember(
                    path=info.filename,
                    size=info.file_size,
                    is_dir=info.isdir(),
                ))
    except rarfile.RarCannotExec as exc:
        raise ArchiveError("Không tìm thấy chương trình unrar. Chỉ hỗ trợ RAR4 không mã hóa.") from exc
    except rarfile.Error as exc:
        raise ArchiveError("File RAR bị lỗi hoặc không thể giải nén") from exc
    return members


async def read_archive_member(document: Document, member_path: str) -> bytes:
    """Đọc bytes của 1 file trong archive."""
    if not _is_safe_member(member_path):
        raise ArchiveError("Đường dẫn không hợp lệ")
    raw = await _load_raw(document)
    if _is_rar(raw):
        return _read_rar(raw, member_path)
    return _read_zip(raw, member_path)


def _read_zip(raw: bytes, member_path: str) -> bytes:
    try:
        with zipfile.ZipFile(BytesIO(raw)) as archive:
            return archive.read(member_path)
    except KeyError as exc:
        raise ArchiveError(f"Không tìm thấy file '{member_path}' trong ZIP") from exc
    except zipfile.BadZipFile as exc:
        raise ArchiveError("File ZIP bị lỗi hoặc không thể giải nén") from exc


def _read_rar(raw: bytes, member_path: str) -> bytes:
    if rarfile is None:
        raise ArchiveError("Chưa cài thư viện rarfile để đọc file .rar")
    try:
        with rarfile.RarFile(BytesIO(raw)) as archive:
            return archive.read(member_path)
    except rarfile.Error as exc:
        raise ArchiveError(f"Không thể đọc '{member_path}' trong RAR") from exc