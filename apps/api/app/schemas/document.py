"""
Pydantic schemas cho Document endpoints.

Endpoints:
- POST /api/documents/upload  → upload file (multipart)
- GET  /api/documents/{id}   → lấy metadata 1 file
- GET  /api/documents         → list tất cả files
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

from app.models.entities import DocType, DocumentStatus, DocumentPurpose


class DocumentResponse(BaseModel):
    """Response khi lấy metadata 1 document."""
    id: int
    filename: str
    file_type: str
    doc_type: DocType
    status: DocumentStatus
    purpose: DocumentPurpose
    storage_key: str
    content_hash: Optional[str] = None
    uploaded_by: Optional[int] = None
    created_at: datetime
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[int] = None

    class Config:
        from_attributes = True


class DocumentListResponse(BaseModel):
    """Response khi list tất cả documents."""
    total: int = Field(..., description="Tổng số documents")
    items: list[DocumentResponse] = Field(..., description="Danh sách documents")


# ---------------------------------------------------------------------------
# Multipart upload schemas (file lớn, chia chunks)
# ---------------------------------------------------------------------------


class MultipartInitRequest(BaseModel):
    """Request để bắt đầu 1 multipart upload session."""
    filename: str = Field(..., description="Tên file gốc (an toàn, đã sanitize)")
    size: int = Field(..., gt=0, le=10 * 1024 * 1024 * 1024, description="Tổng dung lượng (bytes), max 10GB")
    mime: Optional[str] = Field(None, description="Content-Type, mặc định đoán theo extension")
    purpose: DocumentPurpose = Field(DocumentPurpose.student_project)


class MultipartPartInfo(BaseModel):
    """Thông tin 1 part mà FE dùng để upload chunk."""
    part_number: int = Field(..., ge=1, le=10000)
    url: str = Field(..., description="Presigned URL — FE PUT trực tiếp lên MinIO")
    chunk_size: int = Field(..., description="Kích thước chunk cho part này (bytes)")


class MultipartInitResponse(BaseModel):
    """Response sau khi init: FE dùng upload_id để track + danh sách URLs."""
    upload_id: str = Field(..., description="UUID session — dùng để complete/abort/resume")
    storage_key: str = Field(..., description="MinIO object key")
    bucket: str
    chunk_size: int = Field(..., description="Kích thước mỗi chunk (bytes), mặc định 8MB")
    parts_expected: int = Field(..., description="Tổng số part FE cần upload")
    parts: list[MultipartPartInfo]


class MultipartCompletePart(BaseModel):
    """1 part đã upload xong — FE báo lại cho BE."""
    PartNumber: int = Field(..., ge=1, le=10000)
    ETag: str = Field(..., description="ETag từ header response của PUT part URL")


class MultipartCompleteRequest(BaseModel):
    """Request để ghép các parts thành file hoàn chỉnh."""
    parts: list[MultipartCompletePart] = Field(..., min_length=1)


class MultipartCompleteResponse(BaseModel):
    """Response sau khi complete: file đã được ghép + document record đã tạo."""
    upload_id: str
    document_id: int = Field(..., description="ID của Document record — dùng cho scan")
    storage_key: str
    filename: str
    size: int


class MultipartStatusResponse(BaseModel):
    """Trạng thái hiện tại của session — dùng để resume."""
    upload_id: str
    status: str  # pending | completed | aborted
    parts_expected: int
    parts_received: int
    document_id: Optional[int] = None
    uploaded_parts: list[dict] = Field(
        default_factory=list,
        description="[{PartNumber, ETag, Size}, ...] các part đã có trên MinIO"
    )
