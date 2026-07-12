"""
Question Generator Service — Generate 10 câu hỏi từ document.

Luồng xử lý:
    POST /api/questions/generate {document_id, persona}
        ↓
    Load document + validate (phải là PDF/DOCX/PPTX, không phải ZIP)
        ↓
    Check assessment đã tồn tại chưa? (document_id + persona)
        ↓
    Nếu chưa: parse_and_chunk(document) → chunks
        ↓
    Lưu chunks vào assessments.chunks
        ↓
    Gọi AI Gateway với chunks + persona prompt → generate 10 câu hỏi
        ↓
    Lưu kết quả vào assessments.questions
        ↓
    Trả về assessment
"""
from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Document, DocType, Assessment, AssessmentStatus
from app.services.document_parser import parse_and_chunk, DocumentParserError
from app.services.ai_client import ai_gateway

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Persona definitions
# ---------------------------------------------------------------------------
PERSONA_PROMPTS: dict[str, str] = {
    "mentor": (
        "Bạn là mentor/hướng dẫn viên của sinh viên. "
        "Hãy đặt câu hỏi giúp sinh viên hiểu rõ vấn đề và tự tin hơn. "
        "Tập trung vào: mục tiêu, cách triển khai, kết quả đạt được."
    ),
    "investor": (
        "Bạn là nhà đầu tư tiềm năng. "
        "Hãy đặt câu hỏi về: tính khả thi, thị trường, đội ngũ, kế hoạch kinh doanh, "
        "điểm khác biệt so với đối thủ."
    ),
    "cto": (
        "Bạn là CTO/Kỹ sư trưởng. "
        "Hãy đặt câu hỏi về: kiến trúc phần mềm, công nghệ sử dụng, "
        "hiệu suất, bảo mật, scalability, code quality."
    ),
    "ly_thuyet": (
        "Bạn là người hỏi về mặt lý thuyết. "
        "Hãy đặt câu hỏi về: cơ sở lý thuyết, thuật toán, lý do chọn phương pháp, "
        "so sánh với các phương pháp khác."
    ),
    "thuc_te": (
        "Bạn là người hỏi về thực tế triển khai. "
        "Hãy đặt câu hỏi về: cách thức hoạt động thực tế, "
        "test cases, edge cases, quá trình develop."
    ),
    "khat_khe": (
        "Bạn là người hỏi rất khắt khe. "
        "Hãy đặt câu hỏi khó, đi sâu vào chi tiết kỹ thuật, "
        "tìm ra điểm yếu của project, thách thức sinh viên."
    ),
}

# System prompt chung cho AI
SYSTEM_PROMPT = """Bạn là chuyên gia bảo vệ đồ án. Nhiệm vụ: tạo 10 câu hỏi từ nội dung tài liệu được cung cấp.

YÊU CẦU:
1. Tạo đúng 10 câu hỏi
2. Mỗi câu hỏi phải có gợi ý trả lời (hint) ngắn gọn
3. Phân loại độ khó: easy (dễ), medium (trung bình), hard (khó)
4. Câu hỏi phải liên quan trực tiếp đến nội dung tài liệu
5. Trả về ĐÚNG định dạng JSON sau (không thêm markdown, không thêm text thừa):

{
  "questions": [
    {
      "question": "Câu hỏi...",
      "hint": "Gợi ý trả lời...",
      "difficulty": "easy|medium|hard"
    }
  ]
}
"""

NUM_QUESTIONS = 10

class QuestionGeneratorError(Exception):
    """Lỗi khi generate câu hỏi."""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
async def generate_questions(
    document_id: int,
    persona: str,
    db: AsyncSession,
) -> Assessment:
    """
    Generate 10 câu hỏi từ document + persona.

    Args:
        document_id: ID của document đã upload
        persona: Persona name (mentor/investor/cto/ly_thuyet/thuc_te/khat_khe)
        db: AsyncSession

    Returns:
        Assessment object đã lưu vào DB

    Raises:
        QuestionGeneratorError nếu có lỗi
    """
    # Validate persona
    if persona not in PERSONA_PROMPTS:
        raise QuestionGeneratorError(
            f"Persona '{persona}' không hỗ trợ. "
            f"Available: {', '.join(sorted(PERSONA_PROMPTS.keys()))}"
        )

    # Load document
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalar_one_or_none()
    if not document:
        raise QuestionGeneratorError(f"Document {document_id} not found")

    # Validate doc_type — ZIP không hỗ trợ parse text
    if document.doc_type == DocType.ZIP:
        raise QuestionGeneratorError(
            "ZIP files are not supported for question generation. "
            "Upload PDF/DOCX/PPTX instead."
        )

    # Check assessment đã tồn tại chưa
    existing = await db.execute(
        select(Assessment).where(
            Assessment.document_id == document_id,
            Assessment.persona == persona,
        )
    )
    existing_assessment = existing.scalar_one_or_none()
    if existing_assessment and existing_assessment.status == AssessmentStatus.completed:
        logger.info(
            "Assessment already exists (doc=%s, persona=%s), returning cached",
            document_id, persona,
        )
        return existing_assessment

    # Tạo hoặc update assessment
    if existing_assessment:
        assessment = existing_assessment
        assessment.status = AssessmentStatus.processing
        assessment.chunks = None
        assessment.questions = None
    else:
        assessment = Assessment(
            document_id=document_id,
            persona=persona,
            status=AssessmentStatus.processing,
        )
        db.add(assessment)

    await db.commit()
    await db.refresh(assessment)

    try:
        # Step 1: Parse + chunk document
        logger.info("Parsing document %s ...", document.filename)
        chunks = await parse_and_chunk(document)
        if not chunks:
            raise QuestionGeneratorError(
                f"Could not extract text from '{document.filename}'. "
                "File may be empty, scanned, or image-based."
            )
        logger.info("Extracted %d chunks from %s", len(chunks), document.filename)

        # Step 2: Save chunks to DB
        assessment.chunks = chunks
        await db.commit()

        # Step 3: Generate questions via AI Gateway
        persona_prompt = PERSONA_PROMPTS[persona]
        user_prompt = _build_user_prompt(chunks, persona_prompt, NUM_QUESTIONS)

        logger.info("Calling AI Gateway for question generation (persona=%s)...", persona)
        ai_result = await ai_gateway.orchestrate(prompt=user_prompt, system_prompt=SYSTEM_PROMPT)

        # Step 4: Parse AI response
        content = ai_result.get("content", "")
        questions = _parse_ai_response(content)

        # Step 5: Save questions to DB
        assessment.questions = questions
        assessment.status = AssessmentStatus.completed
        await db.commit()
        await db.refresh(assessment)

        logger.info(
            "Generated %d questions for doc=%s, persona=%s",
            len(questions), document_id, persona,
        )
        return assessment

    except QuestionGeneratorError:
        raise
    except Exception as exc:
        logger.exception("Failed to generate questions for doc=%s", document_id)
        assessment.status = AssessmentStatus.failed
        await db.commit()
        raise QuestionGeneratorError(f"AI generation failed: {exc}") from exc


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _build_user_prompt(chunks: list[str], persona_prompt: str, num_questions: int) -> str:
    """Xây prompt gửi AI: persona context + document content + instruction."""
    # Giới hạn tổng chars để tránh vượt token limit (~6000 chars ≈ 1500 tokens)
    max_chunk_chars = 4000
    truncated = chunks[:3]  # Chỉ lấy 3 chunks đầu để tránh prompt quá dài
    combined = "\n\n---\n\n".join(truncated)
    if len(combined) > max_chunk_chars:
        combined = combined[:max_chunk_chars] + "\n\n[...]"

    return f"""{persona_prompt}

Nội dung tài liệu:
---
{combined}
---

Hãy tạo {num_questions} câu hỏi dựa trên nội dung tài liệu trên.
Trả về JSON như yêu cầu."""


def _parse_ai_response(content: str) -> list[dict[str, Any]]:
    """
    Parse JSON từ AI response.
    Hỗ trợ: JSON thuần, JSON wrapped trong markdown code block.
    """
    text = content.strip()

    # Loại bỏ markdown code block nếu có
    if text.startswith("```"):
        lines = text.split("\n")
        # Bỏ dòng đầu (```json) và dòng cuối (```)
        lines = [l for l in lines[1:] if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse AI response as JSON: %s\nContent: %s", exc, content[:500])
        raise QuestionGeneratorError(
            "AI returned invalid JSON. Please try again."
        ) from exc

    # Validate structure
    if "questions" not in data or not isinstance(data["questions"], list):
        raise QuestionGeneratorError("AI response missing 'questions' array")

    questions = data["questions"]
    if len(questions) == 0:
        raise QuestionGeneratorError("AI returned 0 questions")

    # Normalize每个 question
    normalized = []
    for i, q in enumerate(questions):
        normalized.append({
            "id": i + 1,
            "question": q.get("question", "").strip(),
            "hint": q.get("hint", "").strip(),
            "difficulty": q.get("difficulty", "medium"),
        })

    return normalized
