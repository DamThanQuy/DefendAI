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

    class Config:
        from_attributes = True


class DocumentListResponse(BaseModel):
    """Response khi list tất cả documents."""
    total: int = Field(..., description="Tổng số documents")
    items: list[DocumentResponse] = Field(..., description="Danh sách documents")
