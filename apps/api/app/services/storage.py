"""
MinIO / S3 storage service.

=== MỤC ĐÍCH ===
Service layer thay thế việc ghi file trực tiếp lên disk (uploads/) bằng S3-compatible
object storage (MinIO local / AWS S3). Dùng aioboto3 để giữ async context.

=== CẤU TRÚC MỞ RỘNG ===
- save_doc / get_doc / delete_doc: convenience methods dùng bucket mặc định (settings.minio.bucket)
- Nếu muốn thêm bucket khác, gọi save(bucket, key, ...) trực tiếp
- Khi lên production (AWS S3): chỉ cần đổi endpoint trong .env, không đổi code

=== BẢO TRÌ ===
1. Session init: lazy singleton (global _s3_client), chỉ create 1 lần.
   - Muốn pool session cho production: thay _get_client() bằng aioboto3.Session() cache
2. Retry: hiện chưa có. Thêm @tenacity.retry khi cần.
   - Điểm hook: ở mỗi hàm save/get/delete, wrap try-except-raise
3. Timeout: aioboto3 default 60s. Endpoint http://minio:9000 (local) nên không cần set.
   - Nếu production: thêm config.read_timeout, config.connect_timeout
4. Logging: logger.debug cho mọi operation.
   - Cảnh báo khi MinIO down: logger.warning() trong except
5. ContentType detection: hiện dùng application/octet-stream default.
   - Muốn auto-detect: thêm import mimetypes khi cần

=== SỬ DỤNG ===
    from app.services.storage import save_doc, get_doc, delete_doc

    # Upload
    key = f"documents/{uuid.uuid4().hex[:16]}_report.pdf"
    await save_doc(key, file_bytes, content_type="application/pdf")

    # Download (dùng trong document_parser.py)
    data = await get_doc(key)

=== PRODUCTION CHECKLIST ===
1. Thêm aioboto3>=13.2.0 vào requirements.txt (đã có)
2. Thêm env vars vào .env:
   MINIO_ENDPOINT=http://minio:9000
   MINIO_ACCESS_KEY=minioadmin
   MINIO_SECRET_KEY=minioadmin
   MINIO_BUCKET=defend-files
   MINIO_REGION=us-east-1
   MINIO_SECURE=false
3. Khi deploy production: đổi endpoint → AWS S3 URL, đổi access_key/secret → IAM role
4. Nếu AWS S3: dùng session = aioboto3.Session() không cần endpoint_url
"""
from __future__ import annotations

import logging
from typing import AsyncIterator, Callable, Optional, TYPE_CHECKING

from app.core.config import settings

if TYPE_CHECKING:
    import aioboto3

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Session pool
# ---------------------------------------------------------------------------
# Singleton: _s3_client là aioboto3.Session (global)
# Muốn pool: dùng aioboto3.Session() factory → thread-safe
# Hiện tại: mỗi save/get/delete tạo 1 context manager mới
# Ponytail: nếu upload > 50 concurrent → dùng aioboto3.Session() bên ngoài, reuse
_s3_session: "aioboto3.Session | None" = None


def _get_session() -> "aioboto3.Session":
    """Lazy init session. Thread-safe cho FastAPI app.

    1 lần duy nhất khi import. Không cần lock vì GIL.
    """
    global _s3_session  # noqa: PLW0603
    if _s3_session is None:
        import aioboto3

        _s3_session = aioboto3.Session()

        logger.info("S3 session ready — bucket=%s", settings.minio.bucket)
    return _s3_session


def _client_kwargs() -> dict:
    """Build kwargs for `session.client("s3", ...)`.

    aioboto3 ≥ 13 ưu tiên nhận credentials/region trong `client()` thay vì `Session()`.
    Nếu truyền ở Session() mà client() tự khởi tạo lại credentials chain → NoCredentialsError.
    """
    cfg = settings.minio
    return {
        "endpoint_url": cfg.endpoint,
        "aws_access_key_id": cfg.access_key_id,
        "aws_secret_access_key": cfg.secret_access_key,
        "region_name": cfg.region,
    }


# ---------------------------------------------------------------------------
# Core S3 operations
# ---------------------------------------------------------------------------
# Mỗi hàm dùng async context manager: session.client("s3", endpoint_url=...)
# Po nytail: Nếu muốn dùng lại 1 client instance (không tạo mới mỗi lần),
#   dùng _get_session().client() bên ngoài async with → pass vào hàm
#   Dễ mở rộng: s3_resource = session.resource("s3") → dùng resource API


async def save(
    bucket: str,
    key: str,
    body: bytes,
    content_type: str,
) -> None:
    """PUT object lên MinIO bucket.

    Args:
        bucket: tên bucket (e.g. "defend-files")
        key: object key (e.g. "documents/a1b2_report.pdf")
        body: file bytes
        content_type: MIME type (e.g. "application/pdf")

    Raises:
        ClientError: MinIO connection error hoặc bucket not exist
    """
    session = _get_session()
    async with session.client("s3", **_client_kwargs()) as s3:
        await s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=body,
            ContentType=content_type,
        )
    logger.debug("Uploaded %s/%s (%s bytes)", bucket, key, len(body))


async def get(bucket: str, key: str) -> bytes:
    """GET object bytes từ MinIO bucket.

    Returns:
        Raw file bytes. Dùng để parse trong document_parser.py

    ⚠️ Cảnh báo memory: Load TOÀN BỘ object vào RAM. Với file 2.7GB ZIP
    sẽ tốn ~2.7GB RAM. Dùng `iter_object_chunks()` cho file lớn.
    """
    session = _get_session()
    async with session.client("s3", **_client_kwargs()) as s3:
        resp = await s3.get_object(Bucket=bucket, Key=key)
        data = await resp["Body"].read()
    logger.debug("Downloaded %s/%s (%s bytes)", bucket, key, len(data))
    return data


async def get_range(bucket: str, key: str, start: int, end: int) -> bytes:
    """GET một phần (byte range) của object từ MinIO bucket.

    Args:
        bucket: tên bucket
        key: object key
        start: byte offset bắt đầu (inclusive)
        end: byte offset kết thúc (inclusive)

    Returns:
        Raw bytes của range được yêu cầu.
    """
    session = _get_session()
    async with session.client("s3", **_client_kwargs()) as s3:
        resp = await s3.get_object(
            Bucket=bucket,
            Key=key,
            Range=f"bytes={start}-{end}",
        )
        data = await resp["Body"].read()
    logger.debug("Downloaded range %d-%d of %s/%s (%s bytes)", start, end, bucket, key, len(data))
    return data


async def iter_object_chunks(
    bucket: str,
    key: str,
    chunk_size: int = 8 * 1024 * 1024,  # 8MB
) -> "AsyncIterator[bytes]":
    """Stream download object từ MinIO theo từng chunk.

    Dùng cho file LỚN (GB). Memory chỉ giữ 1 chunk tại 1 thời điểm (~8MB).
    Kết hợp với streaming ZIP parsing để xử lý ZIP hàng chục GB mà
    chỉ tốn vài chục MB RAM.

    Args:
        chunk_size: kích thước mỗi chunk (mặc định 8MB).

    Yields:
        bytes chunks liên tiếp cho đến hết object.
    """
    session = _get_session()
    async with session.client("s3", **_client_kwargs()) as s3:
        resp = await s3.get_object(Bucket=bucket, Key=key)
        body = resp["Body"]
        try:
            while True:
                chunk = await body.read(chunk_size)
                if not chunk:
                    break
                yield chunk
        finally:
            # aioboto3 body hỗ trợ close() để release connection
            if hasattr(body, "close"):
                try:
                    await body.close()
                except Exception:  # noqa: BLE001
                    pass
    logger.debug("Streamed %s/%s (chunk_size=%d)", bucket, key, chunk_size)


async def iter_zip_members(
    bucket: str,
    key: str,
    extensions: "set[str] | None" = None,
    safe_filter: "Callable[[str], bool] | None" = None,
) -> "AsyncIterator[tuple[str, bytes]]":
    """Stream download ZIP từ MinIO + extract từng member.

    Memory tối đa = chunk_size (8MB) + 1 file lớn nhất trong ZIP.
    Phù hợp với file ZIP 5-10GB.

    Args:
        bucket: MinIO bucket.
        key: object key.
        extensions: chỉ yield file có suffix thuộc set này (None = tất cả).
        safe_filter: callable(path) -> bool, filter thêm (skip node_modules, ...).

    Yields:
        (path, raw_bytes) cho mỗi file match điều kiện.

    Raises:
        zipfile.BadZipFile: ZIP không hợp lệ.
        CodeScanError / ValueError: extension không hợp lệ (do caller raise).
    """
    import asyncio as _asyncio
    import inspect as _inspect
    import os as _os
    import tempfile as _tempfile
    import threading as _threading
    import zipfile as _zipfile
    from pathlib import PurePosixPath as _PurePosixPath

    _SENTINEL = object()
    loop = _asyncio.get_running_loop()
    # Backpressure: tối đa 4 member (<=2MB/member sau safe_filter) nằm trong queue
    queue: "_asyncio.Queue" = _asyncio.Queue(maxsize=4)
    stop_event = _threading.Event()

    def _accept(path: str, size: int) -> bool:
        if extensions is not None and _PurePosixPath(path).suffix.lower() not in extensions:
            return False
        if safe_filter is not None:
            try:
                sig = _inspect.signature(safe_filter)
                if len(sig.parameters) >= 2:
                    return bool(safe_filter(path, size))
                return bool(safe_filter(path))
            except Exception:  # noqa: BLE001
                return False
        return True

    def _extract_worker(tmp_path: str) -> None:
        """CHẠY TRONG THREAD RIÊNG: mở ZIP + giải nén từng member rồi đẩy vào queue.

        TUYỆT ĐỐI không gọi zf.read() trên event loop: giải nén member là CPU-bound
        đồng bộ — với ZIP vài GB nó chặn loop đơn của uvicorn hàng chục phút,
        làm TOÀN BỘ API đơ (health/login timeout, SSE ECONNRESET).
        """
        file_count = 0
        try:
            with _zipfile.ZipFile(tmp_path, "r") as zf:
                for info in zf.infolist():
                    if stop_event.is_set():
                        return
                    if info.is_dir() or not _accept(info.filename, info.file_size):
                        continue
                    try:
                        data = zf.read(info)
                    except Exception:  # noqa: BLE001
                        continue
                    file_count += 1
                    _asyncio.run_coroutine_threadsafe(
                        queue.put((info.filename, data)), loop
                    ).result()
                    if stop_event.is_set():
                        return
            logger.info("Extracted %d files from %s/%s", file_count, bucket, key)
            _asyncio.run_coroutine_threadsafe(queue.put(_SENTINEL), loop).result()
        except BaseException as exc:  # noqa: BLE001
            try:
                _asyncio.run_coroutine_threadsafe(queue.put(exc), loop).result(timeout=10)
            except Exception:  # noqa: BLE001
                pass

    tmp_path: str | None = None
    worker_fut = None
    try:
        # Tạo temp file trên disk thật (tránh RAM-disk /tmp bị giới hạn 1GB khi tải file 2-3GB)
        spill_dir = "/app/.tmp" if _os.path.exists("/app") and _os.path.isdir("/app") else None
        if spill_dir:
            _os.makedirs(spill_dir, exist_ok=True)
        fd, tmp_path = _tempfile.mkstemp(suffix=".zip", prefix="minio_zip_", dir=spill_dir)

        _os.close(fd)
        total_bytes = 0
        with open(tmp_path, "wb") as f:
            async for chunk in iter_object_chunks(bucket, key, chunk_size=8 * 1024 * 1024):
                # Ghi disk trong executor để không chặn loop giữa các chunk 8MB
                await loop.run_in_executor(None, f.write, chunk)
                total_bytes += len(chunk)
        logger.info("Downloaded ZIP %s/%s → %s (%d bytes)", bucket, key, tmp_path, total_bytes)

        # Giải nén trong thread → event loop rảnh để trả heartbeat SSE / request khác
        worker_fut = loop.run_in_executor(None, _extract_worker, tmp_path)
        while True:
            item = await queue.get()
            if item is _SENTINEL:
                break
            if isinstance(item, BaseException):
                raise item
            yield item
        await worker_fut
    finally:
        stop_event.set()
        # Giải phóng chỗ trống trong queue để worker đang kẹt ở put() thoát ra
        while not queue.empty():
            try:
                queue.get_nowait()
            except _asyncio.QueueEmpty:
                break
        if worker_fut is not None:
            try:
                await _asyncio.wait_for(_asyncio.shield(worker_fut), timeout=5)
            except Exception:  # noqa: BLE001
                pass
        # Cleanup temp file
        if tmp_path and _os.path.exists(tmp_path):
            try:
                _os.unlink(tmp_path)
            except Exception:  # noqa: BLE001
                pass


async def get_doc_stream(key: str, chunk_size: int = 8 * 1024 * 1024, bucket: str | None = None):
    """Wrapper cho iter_object_chunks dùng bucket mặc định.

    Yields bytes chunks — tiện cho streaming parse.
    """
    async for chunk in iter_object_chunks(
        bucket or settings.minio.bucket, key, chunk_size
    ):
        yield chunk


async def iter_zip_member_names(
    bucket: str,
    key: str,
    safe_filter: "Callable[[str, int | None], bool] | None" = None,
) -> "AsyncIterator[str]":
    """Stream danh sách tên file trong ZIP — chỉ đọc central directory, KHÔNG giải nén.

    Dùng cho classification (chỉ cần path) mà không cần load full body vào RAM.

    Memory: tối đa = 1 file lớn nhất trong ZIP (khi đọc central directory).
    Phù hợp với ZIP vài GB.

    Args:
        bucket: MinIO bucket.
        key: object key.
        safe_filter: callable(path, size) -> bool, skip file nếu False.

    Yields:
        path string cho mỗi file match điều kiện.
    """
    import zipfile as _zipfile
    import tempfile as _tempfile
    import os as _os
    import inspect

    tmp_path: str | None = None
    try:
        fd, tmp_path = _tempfile.mkstemp(suffix=".zip", prefix="minio_zip_names_")
        _os.close(fd)
        with open(tmp_path, "wb") as f:
            async for chunk in iter_object_chunks(bucket, key, chunk_size=8 * 1024 * 1024):
                f.write(chunk)
        with _zipfile.ZipFile(tmp_path, "r") as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                path = info.filename
                if safe_filter is not None:
                    try:
                        sig = inspect.signature(safe_filter)
                        if len(sig.parameters) >= 2:
                            if not safe_filter(path, info.file_size):
                                continue
                        else:
                            if not safe_filter(path):
                                continue
                    except Exception:
                        continue
                yield path
    finally:
        if tmp_path and _os.path.exists(tmp_path):
            try:
                _os.unlink(tmp_path)
            except Exception:
                pass


async def delete(bucket: str, key: str) -> None:
    """DELETE object khỏi MinIO bucket."""
    session = _get_session()
    async with session.client("s3", **_client_kwargs()) as s3:
        await s3.delete_object(Bucket=bucket, Key=key)
    logger.debug("Deleted %s/%s", bucket, key)


async def ensure_bucket(bucket: str | None = None) -> None:
    """Tạo bucket nếu chưa tồn tại. Idempotent. Gọi 1 lần lúc startup."""
    name = bucket or settings.minio.bucket
    session = _get_session()
    async with session.client("s3", **_client_kwargs()) as s3:
        try:
            await s3.head_bucket(Bucket=name)
            return
        except Exception:
            pass
        await s3.create_bucket(Bucket=name)
        logger.info("MinIO bucket created: %s", name)


# ---------------------------------------------------------------------------
# Convenience — dùng bucket default từ config
# ---------------------------------------------------------------------------
# Thêm bucket khác: gọi save(bucket_other, key, ...) trực tiếp
# Muốn thêm upload_to_other_bucket(): viết thêm 1 hàm wrapper ở đây


async def save_doc(
    key: str,
    body: bytes,
    content_type: str = "application/octet-stream",
    bucket: str | None = None,
) -> None:
    """Upload document lên default bucket (settings.minio.bucket).

    Wrapper cho save(), dùng bucket mặc định nếu không truyền.
    """
    await save(bucket or settings.minio.bucket, key, body, content_type)


async def get_doc(key: str, bucket: str | None = None) -> bytes:
    """Download document từ default bucket.

    Dùng trong document_parser.py khi cần parse file từ MinIO.
    """
    return await get(bucket or settings.minio.bucket, key)


async def get_object_size(key: str, bucket: str | None = None) -> int:
    """Trả về size (bytes) của object trên MinIO mà KHÔNG download body.

    Dùng cho progress UI / sanity check trước khi xử lý file lớn.
    """
    session = _get_session()
    async with session.client("s3", **_client_kwargs()) as s3:
        resp = await s3.head_object(Bucket=bucket or settings.minio.bucket, Key=key)
    return int(resp["ContentLength"])


async def delete_doc(key: str, bucket: str | None = None) -> None:
    """Xoá document khỏi default bucket."""
    await delete(bucket or settings.minio.bucket, key)


# ---------------------------------------------------------------------------
# Multipart upload helpers (cho file lớn > 5MB)
# ---------------------------------------------------------------------------
# Pattern giống Google Drive Resumable Upload / AWS S3 Multipart:
#   1. init → nhận upload_id + danh sách presigned URLs cho từng part
#   2. FE upload từng part song song (5MB - 5GB/part)
#   3. complete → BE ghép các parts thành file hoàn chỉnh
#   4. abort (optional) → cleanup khi user hủy


async def create_multipart_upload(
    bucket: str,
    key: str,
    content_type: str = "application/octet-stream",
) -> str:
    """Khởi tạo multipart upload trên MinIO. Trả về UploadId.

    FE sẽ dùng UploadId này để gọi generate_part_url() cho từng part.

    Raises:
        ClientError: MinIO không reachable hoặc bucket không tồn tại.
    """
    session = _get_session()
    async with session.client("s3", **_client_kwargs()) as s3:
        resp = await s3.create_multipart_upload(
            Bucket=bucket,
            Key=key,
            ContentType=content_type,
        )
    upload_id = resp["UploadId"]
    logger.info("Multipart init: bucket=%s key=%s upload_id=%s", bucket, key, upload_id)
    return upload_id


async def generate_part_upload_url(
    bucket: str,
    key: str,
    upload_id: str,
    part_number: int,
    expires_in: int = 3600,
) -> str:
    """Generate presigned URL cho 1 part (PUT trực tiếp lên MinIO).

    URL trả về dùng `MINIO_PUBLIC_ENDPOINT` (nếu cấu hình) thay vì `endpoint` nội bộ,
    để browser ở ngoài Docker có thể truy cập. Nếu không cấu hình, fallback về endpoint.

    Args:
        part_number: từ 1 đến 10000 (S3 limit).
        expires_in: thời gian URL có hiệu lực (giây). Mặc định 1 giờ.

    Returns:
        URL mà FE dùng để PUT chunk binary trực tiếp lên MinIO.
    """
    # Dùng public endpoint để browser (ngoài Docker) truy cập được
    public_endpoint = settings.minio.public_endpoint or settings.minio.endpoint
    public_kwargs = dict(_client_kwargs())
    public_kwargs["endpoint_url"] = public_endpoint

    session = _get_session()
    async with session.client("s3", **public_kwargs) as s3:
        url = await s3.generate_presigned_url(
            "upload_part",
            Params={
                "Bucket": bucket,
                "Key": key,
                "UploadId": upload_id,
                "PartNumber": part_number,
            },
            ExpiresIn=expires_in,
        )
    return url


async def complete_multipart_upload(
    bucket: str,
    key: str,
    upload_id: str,
    parts: list[dict],
) -> None:
    """Ghép các parts thành object hoàn chỉnh trên MinIO.

    Args:
        parts: [{"PartNumber": int, "ETag": str}, ...]
               ETag lấy từ header response của PUT part URL.
    """
    session = _get_session()
    multipart_upload = {
        "Parts": [
            {"PartNumber": p["PartNumber"], "ETag": p["ETag"]}
            for p in sorted(parts, key=lambda x: x["PartNumber"])
        ]
    }
    async with session.client("s3", **_client_kwargs()) as s3:
        await s3.complete_multipart_upload(
            Bucket=bucket,
            Key=key,
            UploadId=upload_id,
            MultipartUpload=multipart_upload,
        )
    logger.info("Multipart complete: bucket=%s key=%s parts=%d", bucket, key, len(parts))


async def abort_multipart_upload(
    bucket: str,
    key: str,
    upload_id: str,
) -> None:
    """Hủy multipart upload, giải phóng storage đã dùng cho các parts."""
    session = _get_session()
    async with session.client("s3", **_client_kwargs()) as s3:
        await s3.abort_multipart_upload(
            Bucket=bucket,
            Key=key,
            UploadId=upload_id,
        )
    logger.info("Multipart aborted: bucket=%s key=%s upload_id=%s", bucket, key, upload_id)


async def upload_part_bytes(
    bucket: str,
    key: str,
    upload_id: str,
    part_number: int,
    data: bytes,
) -> str:
    """Upload part bytes directly to MinIO (server-side proxy).

    Used when browser cannot reach MinIO directly (e.g. no public endpoint).
    Returns ETag of the uploaded part.

    Args:
        data: raw bytes of this part (max 5GB per S3 spec).
    """
    session = _get_session()
    async with session.client("s3", **_client_kwargs()) as s3:
        resp = await s3.upload_part(
            Bucket=bucket,
            Key=key,
            PartNumber=part_number,
            UploadId=upload_id,
            Body=data,
        )
    etag = resp["ETag"].strip('"')
    logger.debug("Uploaded part %d for %s/%s (etag=%s)", part_number, bucket, key, etag)
    return etag


async def list_uploaded_parts(
    bucket: str,
    key: str,
    upload_id: str,
) -> list[dict]:
    """Liệt kê các part FE đã upload thành công (dùng để resume).

    Returns:
        [{"PartNumber": int, "ETag": str, "Size": int}, ...]
    """
    session = _get_session()
    parts = []
    async with session.client("s3", **_client_kwargs()) as s3:
        paginator = s3.get_paginator("list_parts")
        async for page in paginator.paginate(Bucket=bucket, Key=key, UploadId=upload_id):
            for p in page.get("Parts", []):
                parts.append({
                    "PartNumber": p["PartNumber"],
                    "ETag": p["ETag"],
                    "Size": p.get("Size", 0),
                })
    return parts