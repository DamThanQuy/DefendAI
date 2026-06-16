"""
Pydantic schemas cho assessment / generate questions.

Frontend hiện tại đang gọi:
- POST /api/questions/generate

Response cần giữ tương thích tối thiểu với `Question` bên web.
"""
from typing import Literal, Optional

from pydantic import BaseModel, Field


Difficulty = Literal["easy", "medium", "hard"]


class AssessmentQuestion(BaseModel):
    """Một câu hỏi phản biện do AI sinh ra."""

    id: int = Field(..., ge=1)
    question: str = Field(..., min_length=1)
    hint: str = Field(..., min_length=1)
    difficulty: Difficulty
    persona: str = Field(..., min_length=1)


class GenerateQuestionsRequest(BaseModel):
    """Body cho POST /api/questions/generate."""

    document_id: int = Field(..., ge=1, description="ID document đã upload")
    persona: str = Field(
        default="theory",
        min_length=1,
        description="Persona AI: theory | enterprise | strict (có alias tiếng Việt)",
    )
    provider: Optional[str] = Field(
        default=None,
        description="Provider AI tùy chọn: nvidia | google. Nếu bỏ trống sẽ dùng routing mặc định.",
    )
    model: Optional[str] = Field(
        default=None,
        description="Model tùy chọn nếu muốn override default model của provider.",
    )


class GenerateQuestionsResponse(BaseModel):
    """Response cho POST /api/questions/generate."""

    assessment_id: int
    document_id: int
    document_name: str
    persona: str
    status: str
    chunks_count: int
    questions: list[AssessmentQuestion]
    provider: str
    model: str
