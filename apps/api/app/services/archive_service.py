"""Service đọc nội dung file nén (ZIP/RAR) để hiển thị như GitHub file browser.

Khác với code_scanner (chỉ lấy file code cho AI review), service này:
- list_archive_members: liệt kê MỌI file (kể cả binary) thành cây thư mục
- read_archive_member: đọc bytes 1 file bất kỳ trong archive
"""
from __future__ import annotations

import asyncio
import logging
import struct
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePosixPath

from app.models.entities import DocType, Document
from app.core.config import settings
from app.services.storage import get_doc, get_object_size, get_range

try:
    import rarfile
except ImportError:  # pragma: no cover
    rarfile = None  # type: ignore

logger = logging.getLogger(__name__)

MAX_ARCHIVE_FILES = 100000  # 100k, align with 100k-file goal
MAX_TOTAL_UNCOMPRESSED_BYTES = 10 * 1024 * 1024 * 1024  # 10GB

# Ngưỡng an toàn cho đường legacy "tải trọn archive vào RAM" (RAR hoặc fallback).
# Vượt ngưỡng → từ chối sớm với thông báo rõ ràng thay vì ăn hết RAM host
# (get_doc 2.7GB + BytesIO copy ≈ 5.4GB từng làm đơ toàn bộ server production).
MAX_FULL_DOWNLOAD_BYTES = 512 * 1024 * 1024  # 512MB

# Đuôi file tối đa tải về để đọc End-of-Central-Directory + central directory.
# Central directory của ZIP vài chục nghìn file chỉ vài MB; 128MB là dư dả.
_TAIL_BYTES = 128 * 1024 * 1024

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


# ---------------------------------------------------------------------------
# Central-directory parsing qua HTTP range request (KHÔNG tải trọn archive)
# ---------------------------------------------------------------------------
# Bài học production 2026-10-09: `get_doc` trên ZIP 2.7GB = 2.7GB RAM + BytesIO
# copy thêm 2.7GB → vượt giới hạn 5.79GiB của host → TOÀN BỘ server đơ (kể cả
# SSH). Central directory của ZIP nằm ở CUỐI file, chỉ vài MB → đọc bằng 1
# range request là đủ để liệt kê member; đọc 1 member chỉ cần 2 range request
# (local header + compressed data).
_EOCD_SIG = b"PK\x05\x06"
_ZIP64_EOCD_SIG = b"PK\x06\x06"
_ZIP64_LOC_SIG = b"PK\x06\x07"
_CD_SIG = b"PK\x01\x02"

# Member đơn tối đa cho phép đọc qua preview (tránh giải nén vài GB trong request)
MAX_MEMBER_READ_BYTES = 256 * 1024 * 1024  # 256MB


def _iter_central_entries(tail: bytes, tail_start: int):
    """Yield (name, method, comp_size, uncomp_size, header_offset) từ central dir.

    `tail` là phần CUỐI của file ZIP (chứa EOCD + central directory).
    Trả về None nếu central directory không nằm trọn trong tail.
    """
    eocd = tail.rfind(_EOCD_SIG)
    if eocd < 0:
        return None
    entries_total = struct.unpack_from("<H", tail, eocd + 10)[0]
    cd_size = struct.unpack_from("<I", tail, eocd + 12)[0]
    cd_offset = struct.unpack_from("<I", tail, eocd + 16)[0]

    if entries_total == 0xFFFF or cd_offset == 0xFFFFFFFF or cd_size == 0xFFFFFFFF:
        loc = tail.rfind(_ZIP64_LOC_SIG)
        if loc < 0:
            return None
        z64_off = struct.unpack_from("<Q", tail, loc + 8)[0]
        if z64_off < tail_start:
            return None
        i = z64_off - tail_start
        if tail[i : i + 4] != _ZIP64_EOCD_SIG:
            return None
        entries_total = struct.unpack_from("<Q", tail, i + 32)[0]
        cd_size = struct.unpack_from("<Q", tail, i + 40)[0]
        cd_offset = struct.unpack_from("<Q", tail, i + 48)[0]

    if cd_offset < tail_start:
        return None  # central directory không nằm trọn trong tail
    i = cd_offset - tail_start
    out = []
    count = 0
    n = len(tail)
    while i + 46 <= n and count < entries_total:
        if tail[i : i + 4] != _CD_SIG:
            break
        method = struct.unpack_from("<H", tail, i + 10)[0]
        comp = struct.unpack_from("<I", tail, i + 20)[0]
        uncomp = struct.unpack_from("<I", tail, i + 24)[0]
        name_len = struct.unpack_from("<H", tail, i + 28)[0]
        extra_len = struct.unpack_from("<H", tail, i + 30)[0]
        comment_len = struct.unpack_from("<H", tail, i + 32)[0]
        offset = struct.unpack_from("<I", tail, i + 42)[0]
        name = tail[i + 46 : i + 46 + name_len].decode("utf-8", errors="replace")
        if uncomp == 0xFFFFFFFF or comp == 0xFFFFFFFF or offset == 0xFFFFFFFF:
            ei = i + 46 + name_len
            eend = ei + extra_len
            while ei + 4 <= eend:
                hid, hsz = struct.unpack_from("<HH", tail, ei)
                if hid == 0x0001:
                    p = ei + 4
                    if uncomp == 0xFFFFFFFF and p + 8 <= eend:
                        uncomp = struct.unpack_from("<Q", tail, p)[0]
                        p += 8
                    if comp == 0xFFFFFFFF and p + 8 <= eend:
                        comp = struct.unpack_from("<Q", tail, p)[0]
                        p += 8
                    if offset == 0xFFFFFFFF and p + 8 <= eend:
                        offset = struct.unpack_from("<Q", tail, p)[0]
                        p += 8
                    break
                ei += 4 + hsz
        out.append((name, method, comp, uncomp, offset))
        count += 1
        i += 46 + name_len + extra_len + comment_len
    return out


async def _central_entries(document: Document):
    """Đọc central directory bằng 1 range request cuối file. None nếu không được."""
    key = document.storage_key
    try:
        size = await get_object_size(key, bucket=settings.minio.bucket)
    except Exception:  # noqa: BLE001
        return None, 0
    if not size or size < 22:
        return None, size or 0
    tail_len = min(size, _TAIL_BYTES)
    tail = await get_range(
        settings.minio.bucket, key, size - tail_len, size - 1
    )
    entries = _iter_central_entries(tail, size - tail_len)
    return entries, size


def _inflate(raw: bytes) -> bytes:
    import zlib

    return zlib.decompressobj(-zlib.MAX_WBITS).decompress(raw)


async def list_archive_members(document: Document) -> list[ArchiveMember]:
    """Liệt kê toàn bộ file/folder trong archive (không lọc theo extension).

    ZIP: đọc central directory qua range request (O(MB), không phụ thuộc size
    archive). RAR hoặc ZIP không đọc được central dir: fallback tải trọn NHƯNG
    có chặn ngưỡng MAX_FULL_DOWNLOAD_BYTES để không ăn hết RAM host.
    """
    if document.doc_type != DocType.ZIP:
        raise ArchiveError("Chỉ hỗ trợ xem nội dung file ZIP/RAR")

    entries, size = await _central_entries(document)
    if entries is not None:
        members: list[ArchiveMember] = []
        total = 0
        for name, _method, _comp, uncomp, _offset in entries:
            if not _is_safe_member(name):
                continue
            total += uncomp
            if total > MAX_TOTAL_UNCOMPRESSED_BYTES:
                raise ArchiveError("ZIP giải nén vượt ngưỡng an toàn")
            members.append(
                ArchiveMember(path=name, size=uncomp, is_dir=name.endswith("/"))
            )
            if len(members) > MAX_ARCHIVE_FILES:
                raise ArchiveError(
                    f"ZIP chứa quá nhiều file ({len(members)} > {MAX_ARCHIVE_FILES})"
                )
        return members

    # Fallback (RAR / ZIP lạ): tải trọn nhưng CHẶN file quá lớn
    if size and size > MAX_FULL_DOWNLOAD_BYTES:
        raise ArchiveError(
            f"File nén quá lớn ({size / (1024**3):.1f}GB) để liệt kê nội dung trực tiếp."
        )
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
    """Đọc bytes của 1 file trong archive.

    ZIP: 2 range request (local header + compressed data) — KHÔNG tải trọn
    archive vào RAM. Giải nén deflate chạy trong thread để không chặn loop.
    """
    if not _is_safe_member(member_path):
        raise ArchiveError("Đường dẫn không hợp lệ")

    if document.doc_type == DocType.ZIP:
        entries, size = await _central_entries(document)
        if entries is not None:
            target = None
            for name, method, comp, uncomp, offset in entries:
                if name == member_path:
                    target = (method, comp, uncomp, offset)
                    break
            if target is None:
                raise ArchiveError(f"Không tìm thấy file '{member_path}' trong ZIP")
            method, comp, uncomp, offset = target
            if uncomp > MAX_MEMBER_READ_BYTES:
                raise ArchiveError(
                    f"File '{member_path}' quá lớn để xem trước "
                    f"({uncomp / (1024**2):.0f}MB > {MAX_MEMBER_READ_BYTES // (1024**2)}MB)."
                )
            # Local file header: 30 bytes cố định + name_len + extra_len
            lh = await get_range(settings.minio.bucket, document.storage_key, offset, offset + 29)
            if lh[:4] != b"PK\x03\x04":
                raise ArchiveError("ZIP local header không hợp lệ")
            name_len, extra_len = struct.unpack_from("<HH", lh, 26)
            data_start = offset + 30 + name_len + extra_len
            if uncomp == 0:
                return b""
            if method == 0:  # stored
                return await get_range(
                    settings.minio.bucket, document.storage_key, data_start, data_start + uncomp - 1
                )
            raw = await get_range(
                settings.minio.bucket, document.storage_key, data_start, data_start + comp - 1
            )
            if method == 8:  # deflate
                return await asyncio.to_thread(_inflate, raw)
            raise ArchiveError(f"Phương thức nén không hỗ trợ: {method}")

    # RAR / fallback: tải trọn nhưng chặn ngưỡng an toàn
    try:
        size = await get_object_size(document.storage_key, bucket=settings.minio.bucket)
    except Exception:  # noqa: BLE001
        size = None
    if size and size > MAX_FULL_DOWNLOAD_BYTES:
        raise ArchiveError(
            f"File nén quá lớn ({size / (1024**3):.1f}GB) để đọc nội dung trực tiếp."
        )
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