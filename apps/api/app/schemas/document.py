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

from app.models.entities import DocType, DocumentStatus


class DocumentResponse(BaseModel):
    """Response khi lấy metadata 1 document."""
    id: int
    filename: str
    doc_type: DocType
    status: DocumentStatus
    file_path: str
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentListResponse(BaseModel):
    """Response khi list tất cả documents."""
    total: int = Field(..., description="Tổng số documents")
    items: list[DocumentResponse] = Field(..., description="Danh sách documents")
