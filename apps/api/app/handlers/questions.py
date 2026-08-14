"""Handler cho job type 'generate_questions': xử lý AI assessment trong background."""
from __future__ import annotations

import asyncio
import json
import logging
import re
from collections import Counter
from typing import Any

from sqlalchemy import select

from app.core.database import async_session_maker
from app.models.entities import Assessment, AssessmentStatus, Document, DocumentStatus
from app.schemas.assessment import AssessmentQuestion
from app.services.ai_client import ai_gateway
from app.services.chunk_indexer import index_chunks
from app.services.document_parser import DocumentParserError, parse_and_chunk
from app.services.job_queue import register_handler, update_job
from app.services.rubric_service import get_active_rubric

logger = logging.getLogger(__name__)

# ── constants (inlined from questions router) ──

PERSONA_DESCRIPTIONS = {
    "theory": "Giảng viên/hội đồng thiên về lý thuyết, phương pháp, tính chặt chẽ học thuật.",
    "enterprise": "Chuyên gia doanh nghiệp, tập trung vào tính ứng dụng, vận hành và giá trị thực tế.",
    "strict": "Hội đồng khắt khe, hỏi sâu logic, edge cases, số liệu và các điểm yếu.",
}

PERSONA_ALIASES = {
    "ly_thuyet": "theory",
    "thuc_te": "enterprise",
    "khat_khe": "strict",
    "normal": "theory",
    "hard": "strict",
    "tech": "enterprise",
}

QUESTION_BLUEPRINTS = {
    "theory": [
        "Vì sao nhóm chọn hướng tiếp cận này thay vì một phương án khác?",
        "Cơ sở lý thuyết nào quan trọng nhất để bảo vệ lựa chọn của nhóm?",
        "Nếu phải giải thích cho hội đồng, điểm cốt lõi của giải pháp là gì?",
        "Nhóm đã đánh đổi điều gì để đạt được kết quả hiện tại?",
        "Phần nào trong thiết kế dễ bị phản biện nhất và vì sao?",
    ],
    "enterprise": [
        "Trong môi trường thực tế, giải pháp này sẽ được triển khai như thế nào?",
        "Nhóm đo lường hiệu quả bằng tiêu chí nào để chứng minh giá trị thực tế?",
        "Điều gì sẽ xảy ra khi hệ thống gặp dữ liệu xấu, tải cao hoặc thay đổi yêu cầu?",
        "Giải pháp này phù hợp với bối cảnh nào và không phù hợp với bối cảnh nào?",
        "Nếu đưa vào vận hành thật, rủi ro lớn nhất là gì?",
    ],
    "strict": [
        "Điểm yếu lớn nhất của giải pháp này là gì nếu bị kiểm tra chặt?",
        "Nhóm đã chứng minh thế nào rằng kết quả không chỉ là may mắn?",
        "Có giả định ngầm nào có thể làm hỏng toàn bộ cách tiếp cận không?",
        "Nếu thay đổi đầu vào hoặc điều kiện biên, hệ thống có còn đúng không?",
        "Phần nào cần được kiểm chứng thêm trước khi kết luận là ổn?",
    ],
}

FOLLOW_UP_TEMPLATES = [
    "Nhóm đã cân nhắc phương án nào khác trước khi chốt lựa chọn này?",
    "Nếu có thêm thời gian, nhóm sẽ cải thiện điểm nào đầu tiên?",
]

STOPWORDS = {
    "the", "and", "or", "to", "of", "in", "on", "for", "with", "a", "an", "is", "are",
    "this", "that", "it", "as", "by", "be", "from", "at", "into", "we", "you", "they",
    "will", "can", "cho", "và", "là", "của", "các", "một", "những", "được", "trong",
    "ra", "với", "khi", "này", "đó", "do", "vi", "ve", "de", "la", "du", "di", "co",
    "khong", "phan", "he", "thong",
}

GENERIC_TOPICS = {
    "index", "result", "results", "table", "figure", "section", "paper", "document",
    "lifecycle", "heuristic", "degrading", "experiment", "experiments", "validation",
    "dataset", "data", "system", "method", "methods", "approach", "analysis",
    "implementation", "overview", "workflow",
}

MAX_PROMPT_CHARS = 16000
DEFAULT_QUESTION_COUNT = 10


def _normalize_persona(raw_persona: str) -> str:
    persona = (raw_persona or "theory").strip().lower()
    return PERSONA_ALIASES.get(persona, persona)


def _is_teacher_doc(text: str) -> bool:
    """Deterministic heuristic — phát hiện tài liệu do giảng viên soạn (không dùng AI)."""
    lower = text.lower()
    patterns = [
        "cô gửi các bạn", "cô hạnh", "các bạn sinh viên lớp", "các nhóm dự án",
        "hướng dẫn chuẩn bị báo cáo", "các bạn vui lòng đọc kỹ",
        "quy định nộp bài", "quy định đặt tên file", "thời hạn nộp bài",
        "chúc các bạn", "chúc các nhóm",
        "hướng dẫn báo cáo checkpoint", "hướng dẫn cp",
    ]
    for p in patterns:
        if p in lower:
            return True
    return False


def _rubric_defense_block(rubric: dict | None) -> str:
    """Inject tiêu chí chấm bảo vệ (SEP490) từ rubric vào system prompt."""
    if not rubric:
        return ""
    lines = ["\nTiêu chí chấm bảo vệ chuẩn (hội đồng sẽ soi theo các điểm sau):"]
    for c in rubric.get("quality_criteria", []):
        lines.append(f"- {c.get('label')}: đánh giá mức {', '.join(c.get('levels', []))}")
    clo = rubric.get("clo", [])
    if clo:
        lines.append("CLO cần phủ: " + ", ".join(f"{c['code']} ({c['desc']})" for c in clo))
    grading = rubric.get("grading", {})
    if grading:
        lines.append(
            f"Trọng số: OGA {grading.get('oga', {}).get('weight')}% + "
            f"TDA {grading.get('tda', {}).get('weight')}%."
        )
    # Tính năng phải có
    feats = rubric.get("features", [])
    if feats:
        lines.append("Tính năng chuẩn (phải realize đủ): " +
                     ", ".join(f"{f['code']} ({f['desc']})" for f in feats))
    # Quy tắc nghiệp vụ
    brs = rubric.get("business_rules", [])
    if brs:
        lines.append("Quy tắc nghiệp vụ chuẩn (BR phải enforce): " +
                     ", ".join(f"{b['code']}: {b['desc']}" for b in brs[:12]) + " ...")
    # Mốc tiến độ
    ms = rubric.get("milestones", [])
    if ms:
        lines.append("Mốc tiến độ: " + ", ".join(f"T{m['week']}={m['deliverable']}" for m in ms))
    # Checklist báo cáo
    chk = rubric.get("report_checklist", {})
    if chk:
        lines.append("Checklist báo cáo cần phủ: " + "; ".join(f"{k}: {', '.join(v)}" for k, v in chk.items()))
    return "\n".join(lines) + "\n"


def _build_system_prompt(persona: str, rubric: dict | None = None) -> str:
    description = PERSONA_DESCRIPTIONS.get(persona, PERSONA_DESCRIPTIONS["theory"])
    return (
        "Bạn là AI phản biện cho đồ án. Nhiệm vụ của bạn là đọc tài liệu đã được cung cấp, "
        "suy nghĩ như thành viên hội đồng, và tạo ra bộ câu hỏi tranh biện sâu sắc, thực tế, có tính soi lỗi.\n\n"
        f"Persona: {persona}\n"
        f"Mô tả persona: {description}\n"
        + _rubric_defense_block(rubric)
        + "\n⚠️ ANTI-HALLUCINATION: TUYỆT ĐỐI KHÔNG bịa đặt, suy diễn, hay thêm thông tin "
        "không có trong nội dung. Mỗi câu hỏi PHẢI bám sâu vào ít nhất một chi tiết cụ thể "
        "từ tài liệu. Nếu tài liệu quá ngắn hoặc không đủ nội dung để tạo câu hỏi chất lượng, "
        "hãy tạo ÍT câu hỏi hơn nhưng chất lượng hơn. Mảng questions có thể có 0 phần tử.\n\n"
        "LUẬT BẮT BUỘC (CRITICAL): BẠN CHỈ ĐƯỢC PHÉP TRẢ VỀ ĐÚNG MỘT OBJECT JSON. "
        "KHÔNG ĐƯỢC CÓ BẤT KỲ CHỮ NÀO KHÁC TRƯỚC HAY SAU JSON.\n\n"
        "CẤU TRÚC PHẢI NHƯ SAU:\n"
        '{\n'
        '  "questions": [\n'
        '    {\n'
        '      "id": 1,\n'
        '      "question": "Nội dung câu hỏi...",\n'
        '      "hint": "Gợi ý trả lời...",\n'
        '      "difficulty": "easy",\n'
        f'      "persona": "{persona}"\n'
        '    }\n'
        '  ]\n'
        '}'
    )


def _truncate_text(text: str, max_chars: int = MAX_PROMPT_CHARS) -> str:
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n\n[... truncated because document is too long ...]"


def _build_user_prompt(filename: str, doc_type: str, chunks: list[str], persona: str) -> str:
    chunk_text = []
    for index, chunk in enumerate(chunks, start=1):
        chunk_text.append(f"[Chunk {index}]\n{chunk}")

    prompt = (
        f"Document name: {filename}\n"
        f"Document type: {doc_type}\n"
        f"Persona: {persona}\n\n"
        "Hãy đọc các đoạn trích (chunks) bên dưới rồi sinh câu hỏi phản biện. "
        "Câu hỏi phải bám sát nội dung cụ thể, tránh chung chung. "
        "Ưu tiên hỏi về mục tiêu, kiến trúc, công nghệ, trade-off, giới hạn, rủi ro.\n\n"
        "⚠️ TUYỆT ĐỐI KHÔNG bịa đặt thông tin. Nếu nội dung không đủ để hỏi, hãy trả về mảng "
        "questions rỗng hoặc ít câu nhưng chất lượng. Chất lượng quan trọng hơn số lượng.\n\n"
        "Document chunks:\n"
        + "\n\n".join(chunk_text)
    )
    return _truncate_text(prompt)


def _extract_json_payload(content: str) -> dict[str, Any]:
    text = content.strip()
    # combo-3 (stepfun) may prepend a free-text reasoning preamble before the JSON.
    tick3 = "`" * 3
    if text.startswith(tick3):
        text = re.sub(r"^" + tick3 + r"(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*" + tick3 + r"$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Greedy bracket capture drops leading reasoning / trailing prose; handles
        # both object and array shapes (the latter normalised to {"questions": [...]}).
        match = re.search(r"[\{\[].*[\}\]]", text, flags=re.DOTALL)
        if match:
            try:
                data = json.loads(match.group(0))
                return {"questions": data} if isinstance(data, list) else data
            except json.JSONDecodeError:
                pass
        logger.error("Failed to parse JSON: %s", text[:200])
        return {"questions": []}


def _normalize_questions(raw_questions: list[Any], persona: str) -> list[AssessmentQuestion]:
    questions: list[AssessmentQuestion] = []
    count = 1
    for item in raw_questions:
        if not isinstance(item, dict):
            continue
        item = dict(item)
        if "question" not in item:
            continue
        item["id"] = count
        item["persona"] = persona
        if "difficulty" not in item or item["difficulty"] not in ["easy", "medium", "hard"]:
            item["difficulty"] = "medium"
        questions.append(AssessmentQuestion(**item))
        count += 1
        if len(questions) >= DEFAULT_QUESTION_COUNT:
            break
    return questions


def _heuristic_questions(filename: str, chunks: list[str], persona: str) -> list[AssessmentQuestion]:
    templates = QUESTION_BLUEPRINTS.get(persona, QUESTION_BLUEPRINTS["theory"])
    follow_ups = FOLLOW_UP_TEMPLATES
    questions: list[AssessmentQuestion] = []
    for index in range(DEFAULT_QUESTION_COUNT):
        difficulty = ["easy", "medium", "hard"][index % 3]
        question_text = templates[index % len(templates)]
        if index >= len(templates):
            question_text = f"{question_text} {follow_ups[index % len(follow_ups)]}"
        hint_text = (
            f"Hãy bám vào phần liên quan đến mục tiêu, giải pháp, thực nghiệm hoặc đánh giá "
            f"trong tài liệu của {filename}."
        )
        questions.append(
            AssessmentQuestion(
                id=index + 1,
                question=question_text,
                hint=hint_text,
                difficulty=difficulty,
                persona=persona,
            )
        )
    return questions


@register_handler("generate_questions")
async def handle_generate_questions(params: dict) -> dict:
    document_id: int = params["document_id"]
    persona_raw: str = params.get("persona", "theory")
    persona = _normalize_persona(persona_raw)

    if persona not in PERSONA_DESCRIPTIONS:
        raise ValueError(f"Persona không hợp lệ: {persona_raw}")

    job_id = params.get("_job_id")

    async with async_session_maker() as db:
        result = await db.execute(select(Document).where(Document.id == document_id))
        document = result.scalar_one_or_none()
        if not document:
            raise ValueError(f"Document {document_id} not found")

        document.status = DocumentStatus.processing
        assessment = Assessment(
            document_id=document.id,
            persona=persona,
            status=AssessmentStatus.processing,
        )
        db.add(assessment)
        await db.flush()
        await db.commit()
        await db.refresh(document)
        await db.refresh(assessment)

        if job_id:
            await update_job(job_id, progress="10")

        try:
            chunks = await parse_and_chunk(document)
        except DocumentParserError as exc:
            document.status = DocumentStatus.failed
            assessment.status = AssessmentStatus.failed
            await db.commit()
            raise

        if not chunks:
            document.status = DocumentStatus.failed
            assessment.status = AssessmentStatus.failed
            assessment.chunks = []
            await db.commit()
            raise ValueError("Document không có text để phân tích")

        # ── R4: index chunks vào document_chunks (RAG) — best-effort, không chặn job ──
        await index_chunks(document, chunks)

        if job_id:
            await update_job(job_id, progress="30")

        # ── load rubric chấm bảo vệ (thước đo) ──
        rubric = await get_active_rubric(db, scope="defense")

        # ── heuristic: nếu tài liệu do giảng viên soạn → trả về rỗng ──
        full_text = "\n\n".join(chunks)
        if _is_teacher_doc(full_text):
            logger.warning("Document appears to be teacher/guidance material → returning empty questions")
            questions: list[AssessmentQuestion] = []
            assessment.chunks = chunks
            assessment.questions = []
            assessment.status = AssessmentStatus.completed
            document.status = DocumentStatus.completed
            await db.commit()
            await db.refresh(assessment)
            await db.refresh(document)
            return {
                "assessment_id": assessment.id,
                "document_id": document.id,
                "document_name": document.filename,
                "persona": persona,
                "status": assessment.status.value,
                "chunks_count": len(chunks),
                "questions": [],
                "provider": "heuristic",
                "model": "teacher-doc-detector-v1",
                "note": "Tài liệu được phát hiện là hướng dẫn của giảng viên, không phải đồ án sinh viên.",
            }

        system_prompt = _build_system_prompt(persona, rubric=rubric)

        try:
            if job_id:
                await update_job(job_id, progress="50")

            tasks = []
            chunk_groups = [chunks[i:i+3] for i in range(0, len(chunks), 3)]
            for group in chunk_groups:
                tasks.append(ai_gateway.generate(
                    prompt=_build_user_prompt(document.filename, document.doc_type.value, group, persona),
                    system_prompt=system_prompt,
                    temperature=0.2,
                    max_tokens=3000,
                ))

            results = await asyncio.gather(*tasks, return_exceptions=True)

            if job_id:
                await update_job(job_id, progress="70")

            all_raw_questions = []
            for res in results:
                if isinstance(res, Exception):
                    logger.warning("Chunk AI failed, skipping: %s", res)
                    continue
                if isinstance(res, dict) and "content" in res:
                    payload = _extract_json_payload(res["content"])
                    all_raw_questions.extend(payload.get("questions", []))

            questions = _normalize_questions(all_raw_questions, persona)

            # ── nếu AI trả về 0 câu hoặc lỗi hoàn toàn → dùng heuristic tối thiểu ──
            if len(questions) == 0:
                logger.warning("AI returned zero questions, using heuristic fallback")
                questions = _heuristic_questions(document.filename, chunks, persona)
            elif len(questions) < DEFAULT_QUESTION_COUNT:
                logger.info("AI produced %d/%d questions (quality > quantity, no padding)", 
                            len(questions), DEFAULT_QUESTION_COUNT)

            provider_name = "default (multi-chunk)"
            model_name = "default"

        except Exception as exc:
            logger.warning("AI generate failed, using heuristic: %s", exc)
            questions = _heuristic_questions(document.filename, chunks, persona)
            provider_name = "heuristic"
            model_name = "rules-v1"

        if job_id:
            await update_job(job_id, progress="90")

        assessment.chunks = chunks
        assessment.questions = [q.model_dump() for q in questions]
        assessment.status = AssessmentStatus.completed
        document.status = DocumentStatus.completed
        await db.commit()
        await db.refresh(assessment)
        await db.refresh(document)

        return {
            "assessment_id": assessment.id,
            "document_id": document.id,
            "document_name": document.filename,
            "persona": persona,
            "status": assessment.status.value,
            "chunks_count": len(chunks),
            "questions": [q.model_dump() for q in questions],
            "provider": provider_name,
            "model": model_name,
        }
