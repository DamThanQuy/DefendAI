"""Router admin: tài liệu chuẩn (R9) — admin upload → reference_chunks.

Endpoints:
- POST /api/admin/reference  → upload file chuẩn (multipart) → job reference_index (202 + job_id)
- GET  /api/admin/reference  → danh sách tài liệu chuẩn đã index (GROUP BY category, title)

Phân biệt user/reference: Document.purpose = staff_reference → chunk chỉ vào
reference_chunks (không vào document_chunks). Admin-only (`require_role("admin")`).
"""
from __future__ import annotations

import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_role
from app.models.entities import Document, DocumentPurpose, DocumentStatus, User
from app.routers.documents import (
    MAX_FILE_SIZE,
    _get_doc_type,
    _sanitize_filename,
    _validate_magic_bytes,
)
from app.services.job_queue import create_job
from app.services.reference_indexer import delete_reference
from app.services.storage import save_doc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/reference", tags=["Admin"])

REFERENCE_CATEGORIES = ("textbook", "rubric", "sample_project", "spec")


@router.post("/", status_code=202)
async def upload_reference(
    file: UploadFile = File(...),
    category: str = Form(...),
    title: str = Form(...),
    source: str = Form(""),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin")),
) -> dict:
    """Upload 1 tài liệu chuẩn → job index vào reference_chunks (admin only)."""
    category = category.strip()
    if category not in REFERENCE_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"category phải ∈ {REFERENCE_CATEGORIES}")

    title = title.strip()
    if not title or len(title) > 255:
        raise HTTPException(status_code=400, detail="title không được rỗng và ≤ 255 ký tự")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File is empty (0 bytes)")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size: {MAX_FILE_SIZE // (1024 * 1024)}MB",
        )

    safe_filename = _sanitize_filename(file.filename or "unnamed")
    _get_doc_type(safe_filename)
    _validate_magic_bytes(content, Path(safe_filename).suffix.lower())

    storage_key = f"references/{uuid.uuid4().hex[:16]}_{safe_filename}"
    await save_doc(storage_key, content, content_type="application/octet-stream")

    doc = Document(
        filename=safe_filename,
        file_type=Path(safe_filename).suffix.lower(),
        doc_type=_get_doc_type(safe_filename),
        status=DocumentStatus.uploaded,
        storage_key=storage_key,
        purpose=DocumentPurpose.staff_reference,  # 🏷 thẻ phân loại: chỉ vào reference_chunks
        uploaded_by=user.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    job_id = await create_job(
        "reference_index",
        {
            "document_id": doc.id,
            "category": category,
            "title": title,
            "source": source.strip(),
        },
    )
    return {
        "job_id": job_id,
        "document_id": doc.id,
        "title": title,
        "category": category,
        "status": "queued",
    }


@router.get("/chunks")
async def list_reference_chunks(
    category: str = Query(...),
    title: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
) -> dict:
    """Preview nội dung chunks của 1 tài liệu chuẩn (admin)."""
    result = await db.execute(
        text(
            """
            SELECT c.meta->>'chunk_index' AS chunk_index, c.content
            FROM reference_chunks c
            WHERE c.category = :category AND c.title = :title
            ORDER BY (c.meta->>'chunk_index')::int
            """
        ),
        {"category": category, "title": title},
    )
    return {"items": [dict(r) for r in result.mappings().all()]}


@router.delete("/")
async def remove_reference(
    category: str = Query(...),
    title: str = Query(...),
    _: object = Depends(require_role("admin")),
) -> dict:
    """Xoá tài liệu chuẩn: chunks + Document gốc + file MinIO (admin)."""
    result = await delete_reference(category, title)
    return {**result, "category": category, "title": title}


@router.get("/")
async def list_reference(
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
) -> dict:
    """Danh sách tài liệu chuẩn đã index, gom theo (category, title), mới → cũ."""
    result = await db.execute(
        text(
            """
            SELECT category, title,
                   COUNT(*) AS chunks,
                   MAX(created_at) AS updated_at
            FROM reference_chunks
            GROUP BY category, title
            ORDER BY MAX(created_at) DESC
            """
        )
    )
    items = []
    for r in result.mappings().all():
        it = dict(r)
        it["chunks"] = int(it["chunks"])
        it["updated_at"] = it["updated_at"].isoformat()
        items.append(it)
    return {"items": items}