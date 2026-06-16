"""Pydantic schemas cho Question Generation endpoints."""
from typing import Any, Optional
from pydantic import BaseModel, Field


class QuestionGenerateRequest(BaseModel):
    """Request body cho POST /api/questions/generate."""
    document_id: int
    persona: str = Field(
        ...,
        description="Persona name: mentor, investor, cto, ly_thuyet, thuc_te, khat_khe",
    )


class QuestionItem(BaseModel):
    """1 câu hỏi đơn lẻ."""
    id: int
    question: str
    hint: str
    difficulty: str


class QuestionGenerateResponse(BaseModel):
    """Response cho POST /api/questions/generate."""
    assessment_id: int
    document_id: int
    persona: str
    questions: list[dict[str, Any]]
    status: str
