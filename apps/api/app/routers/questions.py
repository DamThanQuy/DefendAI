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


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/questions", tags=["Questions"])

PERSONA_ALIASES = {
    "ly_thuyet": "theory",
    "thuc_te": "enterprise",
    "khat_khe": "strict",
    "normal": "theory",
    "hard": "strict",
    "tech": "enterprise",
}

PERSONA_DESCRIPTIONS = {
    "theory": "Giảng viên/hội đồng thiên về lý thuyết, phương pháp, tính chặt chẽ học thuật.",
    "enterprise": "Chuyên gia doanh nghiệp, tập trung vào tính ứng dụng, vận hành và giá trị thực tế.",
    "strict": "Hội đồng khắt khe, hỏi sâu logic, edge cases, số liệu và các điểm yếu.",
}


def _normalize_persona(raw_persona: str) -> str:
    persona = (raw_persona or "theory").strip().lower()
    return PERSONA_ALIASES.get(persona, persona)


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
    persona = _normalize_persona(req.persona)
    if persona not in PERSONA_DESCRIPTIONS:
        raise HTTPException(
            status_code=400,
            detail="Persona không hợp lệ. Dùng theory, enterprise, strict hoặc alias ly_thuyet, thuc_te, khat_khe.",
        )

    result = await db.execute(select(Document).where(Document.id == req.document_id))
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail=f"Document {req.document_id} not found")

    job_id = await create_job("generate_questions", {
        "document_id": req.document_id,
        "persona": req.persona,
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
    return {
        "assessment_id": assessment.id,
        "document_id": assessment.document_id,
        "document_name": document.filename if document else "Unknown",
        "persona": assessment.persona,
        "questions": questions,
        "total": len(questions),
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
        persona=assessment.persona,
        status=assessment.status.value,
        chunks_count=len(assessment.chunks or []),
        questions=[
            AssessmentQuestion(**q) if isinstance(q, dict) else q
            for q in (assessment.questions or [])
        ],
        provider="cached",
        model="cached",
    )
