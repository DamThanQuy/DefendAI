"""Router cho code review / source code scan."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.entities import DocType, Document
from app.schemas.code_scan import CodeScanRequest
from app.schemas.job import JobResponse
from app.services.job_queue import create_job


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/code", tags=["Code Review"])


@router.post(
    "/scan",
    response_model=JobResponse,
    status_code=202,
    summary="Quét source code từ ZIP document (async)",
    description="Tạo job xử lý ZIP source code. Dùng GET /api/jobs/{job_id} để poll kết quả.",
)
async def scan_code(req: CodeScanRequest, db: AsyncSession = Depends(get_db)) -> JobResponse:
    # Validate document exists + is ZIP (nhanh, không đợi xử lý)
    result = await db.execute(select(Document).where(Document.id == req.document_id))
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail=f"Document {req.document_id} not found")

    if document.doc_type != DocType.ZIP:
        raise HTTPException(status_code=400, detail="Code review chỉ hỗ trợ document type ZIP")

    job_id = await create_job("code_scan", {
        "document_id": req.document_id,
        "provider": req.provider,
        "model": req.model,
    })

    return JobResponse(
        job_id=job_id,
        status="queued",
        message="Code scan đã được xếp hàng. Dùng GET /api/jobs/{job_id} để lấy kết quả.",
    )
