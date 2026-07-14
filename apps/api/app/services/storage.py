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
from typing import Optional, TYPE_CHECKING

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

        cfg = settings.minio

        _s3_session = aioboto3.Session(
            aws_access_key_id=cfg.access_key_id,
            aws_secret_access_key=cfg.secret_access_key,
            region_name=cfg.region,
        )
        logger.info(
            "S3 session ready — endpoint=%s bucket=%s",
            cfg.endpoint,
            cfg.bucket,
        )
    return _s3_session


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
    async with session.client(
        "s3", endpoint_url=settings.minio.endpoint
    ) as s3:
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
    """
    session = _get_session()
    async with session.client(
        "s3", endpoint_url=settings.minio.endpoint
    ) as s3:
        resp = await s3.get_object(Bucket=bucket, Key=key)
        data = await resp["Body"].read()
    logger.debug("Downloaded %s/%s (%s bytes)", bucket, key, len(data))
    return data


async def delete(bucket: str, key: str) -> None:
    """DELETE object khỏi MinIO bucket."""
    session = _get_session()
    async with session.client(
        "s3", endpoint_url=settings.minio.endpoint
    ) as s3:
        await s3.delete_object(Bucket=bucket, Key=key)
    logger.debug("Deleted %s/%s", bucket, key)


async def ensure_bucket(bucket: str | None = None) -> None:
    """Tạo bucket nếu chưa tồn tại. Idempotent. Gọi 1 lần lúc startup."""
    name = bucket or settings.minio.bucket
    session = _get_session()
    async with session.client(
        "s3", endpoint_url=settings.minio.endpoint
    ) as s3:
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


async def delete_doc(key: str, bucket: str | None = None) -> None:
    """Xoá document khỏi default bucket."""
    await delete(bucket or settings.minio.bucket, key)