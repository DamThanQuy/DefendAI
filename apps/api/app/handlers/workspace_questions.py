"""Handler cho job 'workspace_questions' (R6): hỏi theo đề tài → RAG → câu hỏi kèm nguồn.

Luồng: load row → index-on-demand các file chưa có chunk → retrieve top-K
(flow .env) → prompt RAG kèm citations → AI sinh câu hỏi → lưu.
"""
from __future__ import annotations

import logging
from typing import Any, List

from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session_maker
from app.handlers.questions import (
    DEFAULT_QUESTION_COUNT,
    MAX_PROMPT_CHARS,
    _build_system_prompt,
    _extract_json_payload,
    _heuristic_questions,
    _truncate_text,
)
from app.models.entities import (
    AssessmentStatus,
    Document,
    DocumentChunk,
    DocumentPurpose,
    Workspace,
    WorkspaceFile,
    WorkspaceQuestion,
)
from app.services.ai_client import ai_gateway
from app.services.chunk_indexer import index_chunks
from app.services.document_parser import parse_and_chunk_full
from app.services.job_queue import register_handler, update_job
from app.services.retriever import retrieve_mixed

logger = logging.getLogger(__name__)

_VALID_DIFFICULTIES = ("easy", "medium", "hard")


async def _ensure_indexed(workspace_id: int, force: bool = False) -> None:
    """Index-on-demand: parse + embed các file trong workspace chưa có document_chunks.

    Tự re-index file đã index bằng pipeline cũ (trước figure-inventory): bản cũ
    không có chunk meta.type='diagram' và text thiếu FIGURE INVENTORY → AI chat
    vẫn trả lời "10 diagram" thay vì 86. Phát hiện bằng cách check meta của
    chunk đầu: thiếu 'schema_ver' → re-index.

    Args:
        force: nếu True, re-index tất cả file dù đã có chunks.
    """
    async with async_session_maker() as db:
        result = await db.execute(
            select(WorkspaceFile.document_id).where(WorkspaceFile.workspace_id == workspace_id)
        )
        doc_ids = [r[0] for r in result.fetchall()]
        if not doc_ids:
            return
        r2 = await db.execute(
            select(DocumentChunk.document_id)
            .where(DocumentChunk.document_id.in_(doc_ids))
            .distinct()
        )
        indexed = {r[0] for r in r2.fetchall()}
        missing = doc_ids if force else [d for d in doc_ids if d not in indexed]

        # Phát hiện chunks cũ (pre figure-inventory): doc đã index nhưng chunk
        # đầu không có meta.schema_ver → cần re-index để có figure inventory +
        # diagram chunks. Chỉ check 1 row mỗi doc (rẻ).
        if not force:
            for d in doc_ids:
                if d in indexed:
                    r3 = await db.execute(
                        select(DocumentChunk.meta)
                        .where(DocumentChunk.document_id == d)
                        .order_by(DocumentChunk.chunk_index)
                        .limit(1)
                    )
                    meta = r3.scalar_one_or_none()
                    if not (meta and meta.get("schema_ver") and int(meta["schema_ver"]) >= 3):
                        missing.append(d)
            missing = list(dict.fromkeys(missing))  # dedup giữ thứ tự

        docs: List[Document] = []
        if missing:
            # R9 harden: bỏ qua tài liệu chuẩn (staff_reference) — chúng chỉ đi
            # vào reference_chunks, không bao giờ được index vào document_chunks
            r4 = await db.execute(
                select(Document).where(
                    Document.id.in_(missing),
                    Document.purpose != DocumentPurpose.staff_reference,
                )
            )
            docs = r4.scalars().all()

    for doc in docs:
        try:
            chunks, diagrams, diagram_infos = await parse_and_chunk_full(doc)
            if chunks:
                await index_chunks(doc, chunks, diagrams, diagram_infos=diagram_infos)
                logger.info("Index on-demand doc %s (%s chunks)", doc.id, len(chunks))
        except Exception as exc:  # best-effort từng doc, không chặn cả job
            logger.warning("Index-on-demand failed for doc %s: %s", doc.id, exc)


def _format_context(item: dict) -> str:
    if item.get("source") == "ref":
        return f"[REF: {item['title']}: đoạn {item['chunk_index']}]\n{item['content']}"
    return f"[USER: {item['filename']}: đoạn {item['chunk_index']}]\n{item['content']}"


def _build_rag_prompt(topic: str, contexts: List[str]) -> str:
    body = "\n\n".join(f"{i}. {c}" for i, c in enumerate(contexts, start=1))
    return _truncate_text(
        f"Đề tài cần hỏi: {topic}\n\n"
        "Dưới đây là các đoạn trích liên quan nhất. Nhãn [USER: ...] là nội dung đồ án, "
        "nhãn [REF: ...] là tiêu chuẩn/rubric của hội đồng (mỗi đoạn đầu có nguồn).\n\n"
        f"{body}\n\n"
        "Hãy sinh 5-10 câu hỏi phản biện sắc bén, bám sát đề tài và từng đoạn trích trên. "
        "MỖI câu hỏi PHẢI kèm 'citations' là mảng nguồn [\"file: đoạn X\", ...] mà câu hỏi dựa vào "
        "(chỉ dùng ĐÚNG tên nguồn đã liệt kê ở các đoạn trên). "
        "ĐỒNG THỜI, trong chính nội dung câu hỏi, hãy chèn tham chiếu dạng [số] (VD: \"... hệ thống xử lý như thế nào? [3]\") "
        "ngay sau ý dựa vào nguồn số đó (các nguồn đã được đánh số 1..N ở trên). "
        "MỖI câu hỏi PHẢI có 'suggested_answer' là CÂU TRẢ LỜI MẪU CHI TIẾT (2-4 câu, bám sát "
        "đoạn trích, nêu được lập luận/key point để sinh viên đối đáp tốt với hội đồng). "
        "Trả về đúng một object JSON: "
        '{"questions": [{"question": "...", "suggested_answer": "...", "difficulty": "easy|medium|hard", "citations": ["Nhom5_.pdf: đoạn 1"]}]}. '
        "TUYỆT ĐỐI không bịa đặt nội dung không có trong các đoạn trích.",
        MAX_PROMPT_CHARS,
    )


def _normalize_rag_questions(raw_questions: List[Any]) -> List[dict]:
    """Chuẩn hoá câu hỏi từ AI, giữ citations; lọc citations sai format/điều."""
    out: List[dict] = []
    count = 1
    for item in raw_questions:
        if not isinstance(item, dict) or not item.get("question"):
            continue
        difficulty = item.get("difficulty", "medium")
        citations = item.get("citations", [])
        if not isinstance(citations, list):
            citations = []
        citations = [c for c in citations if isinstance(c, str) and ":" in c][:4]
        out.append({
            "id": count,
            "question": str(item["question"]).strip(),
            "suggested_answer": str(item.get("suggested_answer") or item.get("hint", "")).strip(),
            "difficulty": difficulty if difficulty in _VALID_DIFFICULTIES else "medium",
            "citations": citations,
        })
        count += 1
        if len(out) >= DEFAULT_QUESTION_COUNT:
            break
    return out


@register_handler("workspace_questions")
async def handle_workspace_questions(params: dict) -> dict:
    question_id: int = params["question_id"]
    workspace_id: int = params["workspace_id"]
    topic: str = params["topic"]
    job_id = params.get("_job_id")

    async with async_session_maker() as db:
        result = await db.execute(
            select(WorkspaceQuestion).where(WorkspaceQuestion.id == question_id)
        )
        row = result.scalar_one_or_none()
        if not row:
            raise ValueError(f"WorkspaceQuestion {question_id} not found")
        row.status = AssessmentStatus.processing
        await db.commit()

    if job_id:
        await update_job(job_id, progress="10")

    try:
        await _ensure_indexed(workspace_id)
        if job_id:
            await update_job(job_id, progress="50")

        # R10: 2 query song song — user chunks + reference chunks (cùng 1 embed)
        user_results, ref_results = await retrieve_mixed(topic, workspace_id)

        # min_score (R5) quá cao / topic xa → fallback lấy toàn bộ user chunks đạt ngưỡng 0
        saved_min = settings.rag.min_score
        settings.rag.min_score = 0.0
        try:
            if not user_results:
                user_results, ref_results = await retrieve_mixed(topic, workspace_id)
        finally:
            settings.rag.min_score = saved_min

        if not user_results:
            async with async_session_maker() as db:
                row = await db.get(WorkspaceQuestion, question_id)
                row.status = AssessmentStatus.failed
                row.error = "Workspace chưa có nội dung nào được index để hỏi."
                await db.commit()
            return {"question_id": question_id, "status": "failed", "questions": [], "error": row.error}

        # Reference rỗng thì bỏ qua (chỉ dùng user chunks) — không chặn job
        contexts = [_format_context(r) for r in user_results + ref_results]
        prompt = _build_rag_prompt(topic, contexts)
        ai_result = await ai_gateway.generate(
            prompt=prompt,
            system_prompt=_build_system_prompt(),
            temperature=0.2,
            # Gateway routes to a reasoning model (step-3.7-flash) that spends most of
            # max_tokens on `reasoning`; 4000 left no budget for the JSON answer (empty
            # content → heuristic fallback writing `hint`). 12000 leaves room for both.
            max_tokens=12000,
        )
        payload = _extract_json_payload(ai_result["content"])
        questions = _normalize_rag_questions(payload.get("questions", []))

        if not questions:  # AI trả 0 câu → heuristic tối thiểu
            qs = _heuristic_questions(topic, contexts)
            questions = [q.model_dump() | {"citations": []} for q in qs]

        # Nguồn đã dùng, đánh số 1..N đúng thứ tự context trong prompt (circle style)
        sources = [
            {
                "num": i + 1,
                "source": r["source"],
                "title": str(r.get("title") or r.get("filename") or ""),
                "chunk_index": r.get("chunk_index"),
                "content": str(r.get("content") or "")[:500],
            }
            for i, r in enumerate(user_results + ref_results)
        ]

        async with async_session_maker() as db:
            row = await db.get(WorkspaceQuestion, question_id)
            row.questions = questions
            row.sources = sources
            row.status = AssessmentStatus.completed
            await db.commit()

        if job_id:
            await update_job(job_id, progress="90")

        return {
            "question_id": question_id,
            "workspace_id": workspace_id,
            "status": "completed",
            "questions": questions,
            "provider": ai_result.get("provider", "default"),
            "model": ai_result.get("model", "default"),
        }
    except Exception as exc:
        logger.exception("Workspace question job failed")
        async with async_session_maker() as db:
            row = await db.get(WorkspaceQuestion, question_id)
            if row:
                row.status = AssessmentStatus.failed
                row.error = str(exc)[:500]
                await db.commit()
        raise