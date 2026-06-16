"""
Router cho AI assessment / sinh câu hỏi phản biện.

Luồng chuẩn:
- User upload document
- Backend lưu metadata + file path
- User gọi POST /api/questions/generate
- Backend đọc file, chunk text, gọi AI, lưu vào assessments.questions

Đã nâng cấp cơ chế Map-Reduce + Auto-padding để luôn trả về đủ 10 câu hỏi.
"""
from __future__ import annotations

import json
import logging
import re
import asyncio
from collections import Counter
from itertools import cycle
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.entities import Assessment, AssessmentStatus, Document, DocumentStatus
from app.schemas.assessment import (
    AssessmentQuestion,
    GenerateQuestionsRequest,
    GenerateQuestionsResponse,
)
from app.services.ai_client import ai_gateway
from app.services.document_parser import DocumentParserError, parse_and_chunk


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/questions", tags=["Questions"])


PERSONA_ALIASES = {
    "ly_thuyet": "theory",
    "thuc_te": "enterprise",
    "khat_khe": "strict",
}

PERSONA_DESCRIPTIONS = {
    "theory": "Giảng viên/hội đồng thiên về lý thuyết, phương pháp, tính chặt chẽ học thuật.",
    "enterprise": "Chuyên gia doanh nghiệp, tập trung vào tính ứng dụng, vận hành và giá trị thực tế.",
    "strict": "Hội đồng khắt khe, hỏi sâu logic, edge cases, số liệu và các điểm yếu.",
}

DEFAULT_QUESTION_COUNT = 10
MAX_PROMPT_CHARS = 16000

QUESTION_BLUEPRINTS = {
    "theory": [
        "Vì sao nhóm chọn hướng tiếp cận này thay vì một phương án khác?",
        "Cơ sở lý thuyết nào quan trọng nhất để bảo vệ lựa chọn của nhóm?",
        "Nếu phải giải thích cho hội đồng, điểm cốt lõi của giải pháp là gì?",
        "Nhóm đã đánh đổi điều gì để đạt được kết quả hiện tại?",
        "Phần nào trong thiết kế dễ bị phản biện nhất và vì sao?",
        "Có giả định nào trong mô hình hoặc quy trình cần được chứng minh rõ hơn không?",
        "Nhóm đã kiểm tra độ ổn định của hướng tiếp cận này như thế nào?",
        "Nếu phải tinh gọn giải pháp, nhóm sẽ giữ lại phần nào là quan trọng nhất?",
        "Điểm khác biệt chính giữa giải pháp này và cách làm phổ biến là gì?",
        "Nhóm sẽ trả lời ra sao nếu hội đồng đặt câu hỏi về giới hạn của phương pháp?",
    ],
    "enterprise": [
        "Trong môi trường thực tế, giải pháp này sẽ được triển khai như thế nào?",
        "Nhóm đo lường hiệu quả bằng tiêu chí nào để chứng minh giá trị thực tế?",
        "Điều gì sẽ xảy ra khi hệ thống gặp dữ liệu xấu, tải cao hoặc thay đổi yêu cầu?",
        "Giải pháp này phù hợp với bối cảnh nào và không phù hợp với bối cảnh nào?",
        "Nếu đưa vào vận hành thật, rủi ro lớn nhất nằm ở đâu?",
        "Chi phí triển khai và bảo trì của giải pháp này sẽ được kiểm soát ra sao?",
        "Ai là người dùng cuối và họ nhận được lợi ích cụ thể nào từ hệ thống?",
        "Nhóm sẽ xử lý như thế nào khi cần mở rộng quy mô hoặc thêm tính năng mới?",
        "Giải pháp này có phụ thuộc quá nhiều vào một điều kiện triển khai đặc biệt không?",
        "Nếu doanh nghiệp áp dụng ngay, điểm nghẽn đầu tiên sẽ xuất hiện ở đâu?",
    ],
    "strict": [
        "Điểm yếu lớn nhất của giải pháp này là gì nếu bị kiểm tra chặt?",
        "Nhóm đã chứng minh thế nào rằng kết quả không chỉ là may mắn?",
        "Có giả định ngầm nào có thể làm hỏng toàn bộ cách tiếp cận không?",
        "Nếu thay đổi đầu vào hoặc điều kiện biên, hệ thống có còn đúng không?",
        "Phần nào cần được kiểm chứng thêm trước khi kết luận là ổn?",
        "Nhóm có thể chỉ ra phản ví dụ nào làm lộ hạn chế của giải pháp không?",
        "Lập luận nào trong bài dễ bị bắt bẻ nhất và vì sao?",
        "Nếu yêu cầu độ tin cậy cao hơn, nhóm sẽ thay đổi gì đầu tiên?",
        "Kết quả này có tái lập được nếu chạy lại nhiều lần hay không?",
        "Nhóm sẽ trả lời thế nào nếu hội đồng yêu cầu bằng chứng chặt hơn?",
    ],
}

FOLLOW_UP_TEMPLATES = [
    "Nhóm đã cân nhắc phương án nào khác trước khi chốt lựa chọn này?",
    "Nếu có thêm thời gian, nhóm sẽ cải thiện điểm nào đầu tiên?",
    "Kết quả này có thể bị ảnh hưởng bởi yếu tố nào trong quá trình thực nghiệm?",
    "Có trường hợp nào khiến giải pháp này không còn phù hợp nữa không?",
    "Nếu phải triển khai lại từ đầu, nhóm có giữ nguyên hướng hiện tại không?",
]

STOPWORDS = {
    "the", "and", "or", "to", "of", "in", "on", "for", "with", "a", "an", "is", "are", "this",
    "that", "it", "as", "by", "be", "from", "at", "into", "we", "you", "they", "will", "can",
    "cho", "và", "là", "của", "các", "một", "những", "được", "trong", "ra", "với", "khi", "này",
    "đó", "do", "vi", "ve", "de", "la", "du", "di", "co", "khong", "phan", "he", "thong",
}

GENERIC_TOPICS = {
    "index", "result", "results", "table", "figure", "section", "paper", "document", "lifecycle",
    "heuristic", "degrading", "experiment", "experiments", "validation", "dataset", "data", "system",
    "method", "methods", "approach", "analysis", "implementation", "overview", "workflow",
}


def _normalize_persona(raw_persona: str) -> str:
    persona = (raw_persona or "theory").strip().lower()
    return PERSONA_ALIASES.get(persona, persona)


def _build_system_prompt(persona: str) -> str:
    description = PERSONA_DESCRIPTIONS.get(persona, PERSONA_DESCRIPTIONS["theory"])
    return (
        "Bạn là AI phản biện cho đồ án. Nhiệm vụ của bạn là đọc tài liệu đã được cung cấp, "
        "suy nghĩ như thành viên hội đồng, và tạo ra bộ câu hỏi tranh biện sâu sắc, thực tế, có tính soi lỗi.\n\n"
        f"Persona: {persona}\n"
        f"Mô tả persona: {description}\n\n"
        "LUẬT BẮT BUỘC (CRITICAL): BẠN CHỈ ĐƯỢC PHÉP TRẢ VỀ ĐÚNG MỘT OBJECT JSON. "
        "KHÔNG ĐƯỢC CÓ BẤT KỲ CHỮ NÀO KHÁC TRƯỚC HAY SAU JSON. CẤU TRÚC PHẢI NHƯ SAU:\n"
        "{\n"
        '  "questions": [\n'
        '    {\n'
        '      "id": 1,\n'
        '      "question": "Nội dung câu hỏi...",\n'
        '      "hint": "Gợi ý trả lời...",\n'
        '      "difficulty": "easy",\n'
        f'      "persona": "{persona}"\n'
        '    }\n'
        "  ]\n"
        "}"
    )


def _truncate_text(text: str, max_chars: int = MAX_PROMPT_CHARS) -> str:
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n\n[... truncated because document is too long ...]"


def _build_user_prompt(document: Document, chunks: list[str], persona: str) -> str:
    chunk_text = []
    for index, chunk in enumerate(chunks, start=1):
        chunk_text.append(f"[Chunk {index}]\n{chunk}")

    prompt = (
        f"Document name: {document.filename}\n"
        f"Document type: {document.doc_type.value}\n"
        f"Persona: {persona}\n\n"
        "Hãy đọc các đoạn trích (chunks) bên dưới rồi sinh câu hỏi phản biện. Câu hỏi phải bám sát nội dung, "
        "tránh chung chung. Ưu tiên hỏi về mục tiêu, kiến trúc, công nghệ, trade-off, giới hạn, rủi ro.\n\n"
        "Document chunks:\n"
        + "\n\n".join(chunk_text)
    )
    return _truncate_text(prompt)


def _extract_json_payload(content: str) -> dict[str, Any]:
    text = content.strip()
    
    # 1. Dọn dẹp Markdown code blocks an toàn (tránh lỗi hiển thị UI)
    tick3 = "`" * 3
    if text.startswith(tick3):
        text = re.sub(r"^" + tick3 + r"(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*" + tick3 + r"$", "", text)

    try:
        # Cố gắng parse thẳng
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.warning(f"JSON Parse Error. Đang thử cứu dữ liệu... Lỗi: {e}")
        
        # 2. Chiêu cứu hộ: Tìm mảng JSON bất kỳ (bỏ qua các chữ rác xung quanh)
        match = re.search(r'\[\s*\{.*?\}\s*\]', text, flags=re.DOTALL)
        if match:
            try:
                array_data = json.loads(match.group(0))
                return {"questions": array_data}
            except json.JSONDecodeError:
                pass
                
        # 3. Trả về rỗng để không sập cả group Map-Reduce
        logger.error(f"Thất bại hoàn toàn khi parse JSON. Nội dung rác:\n{text[:200]}...")
        return {"questions": []}


def _normalize_questions(raw_questions: list[Any], persona: str) -> list[AssessmentQuestion]:
    questions: list[AssessmentQuestion] = []
    count = 1
    for item in raw_questions:
        if not isinstance(item, dict):
            continue
        item = dict(item)
        
        # Đảm bảo có đủ trường
        if "question" not in item:
            continue
            
        item["id"] = count
        item["persona"] = persona
        
        if "difficulty" not in item or item["difficulty"] not in ["easy", "medium", "hard"]:
            item["difficulty"] = "medium"
            
        questions.append(AssessmentQuestion(**item))
        count += 1
        
        # Dừng lại nếu đã đủ số lượng câu hỏi
        if len(questions) >= DEFAULT_QUESTION_COUNT:
            break
            
    return questions


def _extract_keywords(chunks: list[str], limit: int = 12) -> list[str]:
    words: list[str] = []
    for chunk in chunks:
        words.extend(re.findall(r"[A-Za-zÀ-ỹ0-9_\-]{4,}", chunk.lower()))

    counter = Counter(
        word.strip("_-0123456789")
        for word in words
        if word and word not in STOPWORDS and len(word.strip("_-0123456789")) >= 4
    )

    topics = [word for word, _ in counter.most_common(limit * 2) if word]
    topics = [topic for topic in topics if topic not in GENERIC_TOPICS]

    phrase_counter: Counter[str] = Counter()
    for chunk in chunks:
        normalized = re.sub(r"\s+", " ", chunk.lower())
        tokens = [token for token in re.findall(r"[A-Za-zÀ-ỹ0-9_\-]{3,}", normalized) if token not in STOPWORDS]
        for size in (2, 3):
            for index in range(len(tokens) - size + 1):
                phrase = " ".join(tokens[index:index + size])
                if any(part in GENERIC_TOPICS for part in phrase.split()):
                    continue
                if len(phrase) < 8:
                    continue
                phrase_counter[phrase] += 1

    phrases = [phrase for phrase, _ in phrase_counter.most_common(limit) if phrase]
    topics = phrases + topics
    seen: set[str] = set()
    deduped: list[str] = []
    for topic in topics:
        normalized = topic.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)

    topics = deduped
    return topics


def _topic_label(topic: str) -> str:
    cleaned = topic.strip()
    if not cleaned:
        return "hướng tiếp cận này"
    if cleaned in GENERIC_TOPICS:
        return "hướng tiếp cận này"
    if len(cleaned.split()) == 1 and len(cleaned) <= 5:
        return "hướng tiếp cận này"
    return cleaned


def _heuristic_questions(document: Document, chunks: list[str], persona: str) -> list[AssessmentQuestion]:
    templates = QUESTION_BLUEPRINTS.get(persona, QUESTION_BLUEPRINTS["theory"])
    follow_ups = [
        "Nhóm đã cân nhắc phương án nào khác trước khi chốt lựa chọn này?",
        "Nếu có thêm thời gian, nhóm sẽ cải thiện điểm nào đầu tiên?",
        "Kết quả này có thể bị ảnh hưởng bởi yếu tố nào trong quá trình thực nghiệm?",
        "Có trường hợp nào khiến giải pháp này không còn phù hợp nữa không?",
        "Nếu phải triển khai lại từ đầu, nhóm có giữ nguyên hướng hiện tại không?",
    ]
    questions: list[AssessmentQuestion] = []

    for index in range(DEFAULT_QUESTION_COUNT):
        difficulty = ["easy", "medium", "hard"][index % 3]
        question_text = templates[index % len(templates)]
        if index >= len(templates):
            question_text = f"{question_text} {follow_ups[index % len(follow_ups)]}"

        hint_text = (
            f"Hãy bám vào phần liên quan đến mục tiêu, giải pháp, thực nghiệm hoặc đánh giá trong tài liệu của {document.filename}."
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


@router.post(
    "/generate",
    response_model=GenerateQuestionsResponse,
    summary="Sinh câu hỏi phản biện từ document đã upload",
    description="Đọc document, chunk text, gọi AI và lưu kết quả vào assessments.",
)
async def generate_questions(
    req: GenerateQuestionsRequest,
    db: AsyncSession = Depends(get_db),
) -> GenerateQuestionsResponse:
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

    try:
        chunks = parse_and_chunk(document)
    except DocumentParserError as exc:
        document.status = DocumentStatus.failed
        assessment.status = AssessmentStatus.failed
        await db.commit()
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not chunks:
        document.status = DocumentStatus.failed
        assessment.status = AssessmentStatus.failed
        assessment.chunks = []
        await db.commit()
        raise HTTPException(
            status_code=400,
            detail="Document không có text để phân tích. Có thể file scan ảnh, rỗng, hoặc không trích xuất được nội dung.",
        )

    system_prompt = _build_system_prompt(persona)

    try:
        # [MAP PHASE]: Xử lý từng chunk (hoặc nhóm 3 chunk) song song
        tasks = []
        chunk_groups = [chunks[i:i+3] for i in range(0, len(chunks), 3)]
        
        for group in chunk_groups:
            tasks.append(ai_gateway.generate(
                prompt=_build_user_prompt(document, group, persona),
                provider="nvidia",
                model="meta/llama-3.1-70b-instruct",
                system_prompt=system_prompt,
                temperature=0.2,
                max_tokens=3000, 
            ))
        
        # Chờ tất cả chạy xong, lỗi ở 1 group không làm vỡ các group khác
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # [REDUCE PHASE]: Tổng hợp kết quả an toàn
        all_raw_questions = []
        for res in results:
            if isinstance(res, Exception):
                logger.warning(f"Một chunk bị lỗi, bỏ qua: {res}")
                continue
            if isinstance(res, dict) and "content" in res:
                payload = _extract_json_payload(res["content"])
                all_raw_questions.extend(payload.get("questions", []))
        
        # Lọc lại, lấy tối đa 10 câu
        questions = _normalize_questions(all_raw_questions, persona)
        
        # TỰ ĐỘNG BÙ CÂU HỎI (PADDING) NẾU AI SINH THIẾU
        if len(questions) < DEFAULT_QUESTION_COUNT:
            logger.warning(f"AI chỉ sinh được {len(questions)} câu hợp lệ. Bù thêm bằng heuristic...")
            fallback_qs = _heuristic_questions(document, chunks, persona)
            needed = DEFAULT_QUESTION_COUNT - len(questions)
            
            # Đắp thêm cho đủ số lượng DEFAULT_QUESTION_COUNT
            for q in fallback_qs[:needed]:
                q.id = len(questions) + 1
                questions.append(q)

        provider_name = "nvidia (multi-chunk)"
        model_name = "meta/llama-3.1-70b-instruct"

    except Exception as exc:
        logger.warning("AI generate failed, falling back to heuristic: %s", exc)
        questions = _heuristic_questions(document, chunks, persona)
        provider_name = "heuristic" 
        model_name = "rules-v1"

    assessment.chunks = chunks
    assessment.questions = [question.model_dump() for question in questions]
    assessment.status = AssessmentStatus.completed
    document.status = DocumentStatus.completed
    await db.commit()
    await db.refresh(assessment)
    await db.refresh(document)

    return GenerateQuestionsResponse(
        assessment_id=assessment.id,
        document_id=document.id,
        document_name=document.filename,
        persona=persona,
        status=assessment.status.value,
        chunks_count=len(chunks),
        questions=questions,
        provider=provider_name,
        model=model_name,
    )