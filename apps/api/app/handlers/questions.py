"""Handler cho job type 'generate_questions': xử lý AI assessment trong background."""
from __future__ import annotations

import asyncio
import json
import logging
import re
from collections import Counter
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import async_session_maker
from app.models.entities import Assessment, AssessmentStatus, Document, DocumentStatus
from app.models.workspace import Workspace, WorkspaceFile
from app.schemas.assessment import AssessmentQuestion
from app.services.ai_client import ai_gateway
from app.services.chunk_indexer import index_chunks
from app.services.circuit_breaker import CircuitOpenError, question_gen_breaker
from app.services.deliverable_check import check_deliverables
from app.services.document_parser import DocumentParserError, parse_and_chunk_full
from app.services.job_queue import register_handler, update_job
from app.services.rubric_service import get_active_rubric

logger = logging.getLogger(__name__)

# ── constants ──

MAX_PROMPT_CHARS = 16000
DEFAULT_QUESTION_COUNT = 10


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


def _get_required_submissions(rubric: dict | None) -> list[dict]:
    """Lấy danh sách báo cáo bắt buộc từ rubric config."""
    if not rubric:
        return []
    return rubric.get("required_submissions", [])


async def _build_deliverable_missing_block(db, document_id: int, rubric: dict | None) -> str:
    """Stage 3 — dùng kết quả Stage 1–2 (check_deliverables theo workspace) để inject vào prompt.

    Tìm workspace chứa document → so khớp files ↔ rubric.deliverables → nếu thiếu thì cảnh báo AI.
    0 LLM, chỉ so khớp thuần logic. Nếu document không thuộc workspace nào → trả rỗng (không ảnh hưởng).
    """
    if not rubric or not rubric.get("deliverables"):
        return ""
    result = await db.execute(
        select(WorkspaceFile)
        .where(WorkspaceFile.document_id == document_id)
        .limit(1)
    )
    wf = result.scalar_one_or_none()
    if not wf:
        return ""
    ws_result = await db.execute(
        select(WorkspaceFile)
        .options(selectinload(WorkspaceFile.document))
        .where(WorkspaceFile.workspace_id == wf.workspace_id)
    )
    workspace_files = [
        {"filename": w.document.filename, "file_type": w.document.file_type}
        for w in ws_result.scalars().all()
        if w.document is not None
    ]
    check = check_deliverables(workspace_files, rubric["deliverables"])
    if not check.missing:
        return ""
    return (
        "\n⚠️ KIỂM TRA FILE NỘP: Sinh viên CHƯA NỘP ĐỦ các sản phẩm bàn giao theo chuẩn SEP490. "
        f"Thiếu: {', '.join(check.missing)} (mới nộp {check.present_count}/{check.total}). "
        "Hãy hỏi sinh viên TẠI SAO chưa nộp các file này và tác động của việc thiếu chúng tới đồ án.\n"
    )


async def _check_missing_submissions(db, rubric: dict | None, document_id: int) -> list[dict]:
    """Đếm documents của team đã upload, trả về các báo cáo bắt buộc còn thiếu."""
    required = _get_required_submissions(rubric)
    if not required:
        return []
    # Lấy document hiện tại để xác định team/workspace
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        return []
    # Lấy tất cả documents của user đã upload (đơn giản: theo uploaded_by)
    # TODO: nếu có workspace/team thì filter theo team
    result = await db.execute(
        select(Document).where(Document.uploaded_by == doc.uploaded_by)
    )
    user_docs = list(result.scalars().all())
    uploaded_names = " ".join(d.filename.lower() for d in user_docs)
    missing = []
    for sub in required:
        key = sub.get("key", "")
        label = sub.get("label", "")
        # Simple heuristic: check if filename contains report number or label
        if key.startswith("report"):
            report_num = key.replace("report", "")
            if f"report {report_num}" not in uploaded_names and report_num not in uploaded_names:
                missing.append(sub)
        elif key == "software":
            # Check for zip/rar/code files
            has_software = any(
                d.file_type in (".zip", ".rar") or "code" in d.filename.lower()
                for d in user_docs
            )
            if not has_software:
                missing.append(sub)
    return missing


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
    # Sản phẩm bàn giao (file cần nộp)
    dlv = rubric.get("deliverables", [])
    if dlv:
        lines.append(
            "Sản phẩm bàn giao phải nộp đủ (dự án thiếu file nào → hỏi sinh viên): "
            + "; ".join(f"{d['code']} {d['name']} ({', '.join(d.get('file_types', []))})" for d in dlv)
        )
    return "\n".join(lines) + "\n"


def _build_system_prompt(rubric: dict | None = None, missing_block: str = "") -> str:
    return (
        "Bạn là AI phản biện cho đồ án. Nhiệm vụ của bạn là đọc tài liệu đã được cung cấp, "
        "suy nghĩ như thành viên hội đồng, và tạo ra bộ câu hỏi tranh biện sâu sắc, thực tế, có tính soi lỗi.\n\n"
        + _rubric_defense_block(rubric)
        + missing_block
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
        '      "difficulty": "easy"\n'
        '    }\n'
        '  ]\n'
        '}'
    )


def _truncate_text(text: str, max_chars: int = MAX_PROMPT_CHARS) -> str:
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n\n[... truncated because document is too long ...]"


def _build_user_prompt(filename: str, doc_type: str, chunks: list[str]) -> str:
    chunk_text = []
    for index, chunk in enumerate(chunks, start=1):
        chunk_text.append(f"[Chunk {index}]\n{chunk}")

    prompt = (
        f"Document name: {filename}\n"
        f"Document type: {doc_type}\n\n"
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


def _normalize_questions(raw_questions: list[Any]) -> list[AssessmentQuestion]:
    questions: list[AssessmentQuestion] = []
    count = 1
    for item in raw_questions:
        if not isinstance(item, dict):
            continue
        item = dict(item)
        if "question" not in item:
            continue
        item["id"] = count
        if "difficulty" not in item or item["difficulty"] not in ["easy", "medium", "hard"]:
            item["difficulty"] = "medium"
        questions.append(AssessmentQuestion(**item))
        count += 1
        if len(questions) >= DEFAULT_QUESTION_COUNT:
            break
    return questions


def _heuristic_questions(filename: str, chunks: list[str]) -> list[AssessmentQuestion]:
    templates = [
        "Mục tiêu chính của đồ án này là gì và tại sao nhóm chọn hướng tiếp cận đó?",
        "Kiến trúc hệ thống được thiết kế như thế nào, các module giao tiếp ra sao?",
        "Công nghệ nào được sử dụng và tại sao lại chọn thay vì giải pháp thay thế?",
        "Nhóm đã xử lý các trường hợp ngoại lệ (edge cases) như thế nào?",
        "Có những rủi ro hay điểm yếu nào trong thiết kế hiện tại?",
        "Kết quả thực nghiệm/đánh giá được đo lường bằng chỉ số nào?",
        "Nếu phải mở rộng quy mô (scale), hệ thống có còn hoạt động tốt không?",
        "Quy trình kiểm thử (testing) được thực hiện ra sao để đảm bảo chất lượng?",
        "Đâu là điểm khác biệt so với các đồ án hoặc sản phẩm tương tự?",
        "Bài học kinh nghiệm lớn nhất sau quá trình thực hiện là gì?",
    ]
    follow_ups = ["Hãy giải thích sâu hơn.", "Cho ví dụ cụ thể từ đồ án.", "Nhóm đã tối ưu điểm này chưa?"]
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
            )
        )
    return questions


@register_handler("generate_questions")
async def handle_generate_questions(params: dict) -> dict:
    document_id: int = params["document_id"]
    job_id = params.get("_job_id")

    async with async_session_maker() as db:
        result = await db.execute(select(Document).where(Document.id == document_id))
        document = result.scalar_one_or_none()
        if not document:
            raise ValueError(f"Document {document_id} not found")

        document.status = DocumentStatus.processing
        assessment = Assessment(
            document_id=document.id,
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
            chunks, diagrams, diagram_infos = await parse_and_chunk_full(document)
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
        await index_chunks(document, chunks, diagrams, diagram_infos=diagram_infos)

        if job_id:
            await update_job(job_id, progress="30")

        # ── load rubric chấm bảo vệ (thước đo) ──
        rubric = await get_active_rubric(db, scope="defense")

        # ── check missing submissions ──
        missing = await _check_missing_submissions(db, rubric, document_id)
        missing_block = ""
        if missing:
            missing_block = (
                "\n⚠️ CẢNH BÁO: Nhóm này còn thiếu báo cáo bắt buộc: " +
                ", ".join(f"{s['label']} (tuần {s['week']})" for s in missing) +
                ". Hãy hỏi sâu về tiến độ và lý do chưa nộp các báo cáo này.\n"
            )
        # ── Stage 3: inject kết quả Stage 1–2 (check deliverables theo workspace) ──
        deliverable_block = await _build_deliverable_missing_block(db, document_id, rubric)
        if deliverable_block:
            missing_block += deliverable_block

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
                "status": assessment.status.value,
                "chunks_count": len(chunks),
                "questions": [],
                "provider": "heuristic",
                "model": "teacher-doc-detector-v1",
                "note": "Tài liệu được phát hiện là hướng dẫn của giảng viên, không phải đồ án sinh viên.",
            }

        system_prompt = _build_system_prompt(rubric=rubric, missing_block=missing_block)
        used_fallback = False

        # Provider/model theo cấu hình chức năng question_gen
        from app.services.feature_ai import resolve_feature_ai
        f_provider, f_model = await resolve_feature_ai(db, "question_gen")

        try:
            if job_id:
                await update_job(job_id, progress="50")

            tasks = []
            chunk_groups = [chunks[i:i+3] for i in range(0, len(chunks), 3)]
            for group in chunk_groups:
                user_prompt = _build_user_prompt(document.filename, document.doc_type.value, group)
                tasks.append(
                    question_gen_breaker.call(
                        ai_gateway.generate,
                        prompt=user_prompt,
                        system_prompt=system_prompt,
                        temperature=0.2,
                        max_tokens=3000,
                        provider=f_provider,
                        model=f_model,
                    )
                )

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

            questions = _normalize_questions(all_raw_questions)

            # ── nếu AI trả về 0 câu hoặc lỗi hoàn toàn → dùng heuristic tối thiểu ──
            if len(questions) == 0:
                logger.warning("AI returned zero questions, using heuristic fallback")
                questions = _heuristic_questions(document.filename, chunks)
            elif len(questions) < DEFAULT_QUESTION_COUNT:
                logger.info("AI produced %d/%d questions (quality > quantity, no padding)", 
                            len(questions), DEFAULT_QUESTION_COUNT)

            provider_name = "default (multi-chunk)"
            model_name = "default"

        except CircuitOpenError:
            used_fallback = True
            logger.warning("Circuit breaker OPEN for question generation — using heuristic fallback")
            questions = _heuristic_questions(document.filename, chunks)
            provider_name = "circuit-breaker-fallback"
            model_name = "rules-v1"
        except Exception as exc:
            used_fallback = True
            logger.warning("AI generate failed, using heuristic: %s", exc)
            questions = _heuristic_questions(document.filename, chunks)
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
            "status": assessment.status.value,
            "chunks_count": len(chunks),
            "questions": [q.model_dump() for q in questions],
            "provider": provider_name,
            "model": model_name,
            "missing_submissions": missing,
            "fallback_used": used_fallback,
        }
