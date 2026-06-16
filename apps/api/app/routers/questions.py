"""
Questions router — Question Generation API.

Endpoints:
- POST /api/questions/generate → Generate 10 câu hỏi từ document + persona
- GET  /api/questions/{assessment_id} → Lấy kết quả assessment
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.entities import Assessment
from app.schemas.question import QuestionGenerateRequest, QuestionGenerateResponse
from app.services.question_generator import generate_questions, QuestionGeneratorError

router = APIRouter(prefix="/api/questions", tags=["Questions"])


@router.post("/generate", response_model=QuestionGenerateResponse, status_code=200)
async def generate(
    req: QuestionGenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate 10 câu hỏi từ document đã upload + persona.

    - Parse nội dung file → chunks
    - Gọi AI Gateway generate câu hỏi
    - Lưu kết quả vào assessments
    """
    try:
        assessment = await generate_questions(
            document_id=req.document_id,
            persona=req.persona,
            db=db,
        )
    except QuestionGeneratorError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return QuestionGenerateResponse(
        assessment_id=assessment.id,
        document_id=assessment.document_id,
        persona=assessment.persona,
        questions=assessment.questions or [],
        status=assessment.status.value,
    )


@router.get("/{assessment_id}", response_model=QuestionGenerateResponse)
async def get_assessment(
    assessment_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Lấy kết quả assessment theo ID."""
    result = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail=f"Assessment {assessment_id} not found")

    return QuestionGenerateResponse(
        assessment_id=assessment.id,
        document_id=assessment.document_id,
        persona=assessment.persona,
        questions=assessment.questions or [],
        status=assessment.status.value,
    )
