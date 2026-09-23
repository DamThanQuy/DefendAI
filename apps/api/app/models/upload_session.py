"""UploadSession — track trạng thái multipart upload lên MinIO.

Lưu trữ session để có thể resume khi mạng lỗi / browser đóng.
Mỗi session = 1 file lớn đang upload theo chunks.

Fields:
    id: UUID session id (client dùng làm key để resume)
    storage_key: MinIO object key (documents/{uuid}_{filename})
    user_id: chủ sở hữu
    filename: tên file gốc (an toàn)
    size: tổng dung lượng (bytes)
    mime: content-type (application/zip, ...)
    parts_expected: số part BE dự kiến (size / chunk_size làm tròn lên)
    parts_received: số part FE đã upload thành công
    status: pending | completed | aborted
    created_at: thời điểm init
    completed_at: thời điểm complete (None nếu chưa xong)
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, BigInteger
from sqlalchemy.orm import relationship

from app.core.database import Base


class UploadSession(Base):
    """Track 1 multipart upload session — cho phép resume khi fail giữa chừng."""

    __tablename__ = "upload_sessions"

    # UUID string thay vì int để client dễ dùng làm key
    id = Column(String(64), primary_key=True, index=True)
    storage_key = Column(String(256), nullable=False, index=True)
    s3_upload_id = Column(String(128), nullable=False)  # MinIO S3 multipart upload id

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    size = Column(BigInteger, nullable=False)  # bytes
    mime = Column(String(100), nullable=False, default="application/octet-stream")

    parts_expected = Column(Integer, nullable=False)
    parts_received = Column(Integer, nullable=False, default=0)

    status = Column(String(20), nullable=False, default="pending", index=True)  # pending|completed|aborted

    document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)  # set khi complete
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    # Không define relationship với User/Document để tránh circular — query thủ công khi cần