"""Admin endpoints cho Document — hard purge tài liệu khỏi DB + MinIO.

Chỉ admin mới truy cập. Xoá cứng row trong `documents` (cascade sang
assessments/code_analyses/chunks/code_module_hashes) + xoá file MinIO.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete as sa_delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import require_role
from app.models.assessment import CodeAnalysisIssue
from app.models.entities import Document
from app.services.storage import delete_doc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/documents", tags=["Admin: Documents"])


@router.delete("/{doc_id}/purge", status_code=204)
async def admin_purge_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("admin")),
):
    """Hard purge: xoá cứng 1 document (kể cả đang nằm trong thùng rác).

    - Xoá row trong `documents` (cascade xoá assessments / code_analyses /
      document_chunks / code_module_hashes nhờ ORM config).
    - Xoá file gốc trên MinIO (best-effort — log warning nếu lỗi nhưng vẫn
      xoá DB row để tránh kẹt thùng rác).
    """
    result = await db.execute(
        select(Document)
        .options(
            selectinload(Document.assessments),
            selectinload(Document.code_analyses),
            selectinload(Document.chunks),
            selectinload(Document.code_module_hashes),
        )
        .where(Document.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")

    storage_key = doc.storage_key

    # Best-effort xoá MinIO. Nếu lỗi, log và vẫn tiếp tục xoá DB row.
    try:
        await delete_doc(storage_key, bucket=settings.minio.bucket)
    except Exception as exc:
        logger.warning("admin purge: MinIO delete failed for key=%s err=%s", storage_key, exc)

    try:
        # Xoá code_analysis_issues trước (FK từ issues → code_analyses) — ORM cascade
        # không tự xử lý vì CodeAnalysis model không khai báo relationship tới Issue.
        if doc.code_analyses:
            analysis_ids = [a.id for a in doc.code_analyses]
            await db.execute(
                sa_delete(CodeAnalysisIssue).where(
                    CodeAnalysisIssue.analysis_id.in_(analysis_ids)
                )
            )
        # Xoá row Document — cascade ORM xử lý assessments / code_analyses /
        # document_chunks / code_module_hashes.
        await db.delete(doc)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        logger.exception("admin purge failed for id=%s: %s", doc_id, exc)
        raise HTTPException(status_code=500, detail=f"Không thể purge document: {exc}")

    logger.info("admin purge document id=%s key=%s", doc_id, storage_key)
    return Response(status_code=204)