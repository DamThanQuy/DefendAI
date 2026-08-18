"""
Router cho AI assessment / sinh câu hỏi phản biện.

Luồng mới (async job queue):
- User upload document → Backend lưu metadata + file path
- User gọi POST /api/questions/generate → Backend tạo job → trả về 202 + job_id
- User poll GET /api/jobs/{job_id} để lấy kết quả khi xong

Worker (worker_main.py) xử lý: parse chunk → Map-Reduce AI → lưu assessment.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.entities import Assessment, Document
from app.schemas.assessment import (
    AssessmentQuestion,
    GenerateQuestionsRequest,
    GenerateQuestionsResponse,
)
from app.schemas.job import JobResponse
from app.services.job_queue import create_job
from app.services.rubric_service import get_active_rubric


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/questions", tags=["Questions"])


@router.post(
    "/generate",
    status_code=202,
    response_model=JobResponse,
    summary="Sinh câu hỏi phản biện từ document đã upload (async)",
    description="Tạo job xử lý document. Dùng GET /api/jobs/{job_id} để poll kết quả.",
)
async def generate_questions(
    req: GenerateQuestionsRequest,
    db: AsyncSession = Depends(get_db),
) -> JobResponse:
    result = await db.execute(select(Document).where(Document.id == req.document_id))
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail=f"Document {req.document_id} not found")

    job_id = await create_job("generate_questions", {
        "document_id": req.document_id,
    })

    return JobResponse(
        job_id=job_id,
        status="queued",
        message="Generate questions job đã được xếp hàng. Dùng GET /api/jobs/{job_id} để lấy kết quả.",
    )


@router.get(
    "/assessments/latest",
    summary="Lấy assessment mới nhất",
)
async def get_latest_assessment(
    db: AsyncSession = Depends(get_db),
):
    """Lấy assessment mới nhất để FE render trang Report."""
    result = await db.execute(
        select(Assessment).order_by(Assessment.id.desc()).limit(1)
    )
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Chưa có assessment nào")

    doc_result = await db.execute(select(Document).where(Document.id == assessment.document_id))
    document = doc_result.scalar_one_or_none()

    questions = assessment.questions or []
    rubric = await get_active_rubric(db, scope="defense")
    missing = []
    if document:
        from app.handlers.questions import _check_missing_submissions
        missing = await _check_missing_submissions(db, rubric, document.id)
    return {
        "assessment_id": assessment.id,
        "document_id": assessment.document_id,
        "document_name": document.filename if document else "Unknown",
        "questions": questions,
        "total": len(questions),
        "missing_submissions": missing,
    }


@router.get(
    "/{assessment_id}",
    response_model=GenerateQuestionsResponse,
    summary="Lấy kết quả assessment theo ID",
)
async def get_assessment(
    assessment_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Lấy kết quả assessment (câu hỏi đã generate) theo ID."""
    result = await db.execute(
        select(Assessment).where(Assessment.id == assessment_id)
    )
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail=f"Assessment {assessment_id} not found")

    # Lấy document info
    doc_result = await db.execute(select(Document).where(Document.id == assessment.document_id))
    document = doc_result.scalar_one_or_none()
    doc_name = document.filename if document else "unknown"

    return GenerateQuestionsResponse(
        assessment_id=assessment.id,
        document_id=assessment.document_id,
        document_name=doc_name,
        doc_type=document.doc_type.value if document else "",
        status=assessment.status.value,
        chunks_count=len(assessment.chunks or []),
        questions=[
            AssessmentQuestion(**q) if isinstance(q, dict) else q
            for q in (assessment.questions or [])
        ],
        provider="cached",
        model="cached",
    )
