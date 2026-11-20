"""Báo cáo sau buổi Mock AI — phần có I/O: xếp hàng job & AI tổng hợp nhận xét.

Luồng: POST /api/mock-ai/end-session snapshot hội thoại vào reports
(generation_status=pending) → job 'mock_report' (worker) gọi AI Gateway với
rubric DB → lưu nhận xét định tính (ready) hoặc lỗi (failed, SV bấm tạo lại).
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker
from app.models.assessment import Report
from app.models.document_chunk import DocumentChunk
from app.models.workspace import Workspace, WorkspaceFile
from app.prompts.mock_report import build_report_prompts
from app.services.ai_client import ai_gateway
from app.services.feature_ai import resolve_feature_ai
from app.services.job_queue import create_job
from app.services.report_builder import (
    extract_json_object,
    format_transcript_for_prompt,
    has_student_answer,
    normalize_ai_review,
)
from app.services.rubric_service import get_rubric_by_key

logger = logging.getLogger(__name__)

RUBRIC_KEY = "defense_sep490"
JOB_TYPE = "mock_report"
DOC_EXCERPT_CHARS = 6000


async def resolve_workspace_for_document(
    db: AsyncSession, user_id: int, document_id: Optional[int]
) -> Optional[int]:
    """Workspace (của chính user) chứa tài liệu — mới thêm gần nhất. None nếu không có."""
    if not document_id:
        return None
    result = await db.execute(
        select(WorkspaceFile.workspace_id)
        .join(Workspace, Workspace.id == WorkspaceFile.workspace_id)
        .where(WorkspaceFile.document_id == document_id, Workspace.user_id == user_id)
        .order_by(WorkspaceFile.added_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _document_excerpt(db: AsyncSession, document_id: int) -> str:
    """Các chunk đầu tài liệu (đã index) làm ngữ cảnh phụ cho AI."""
    rows = (
        await db.execute(
            select(DocumentChunk.content)
            .where(DocumentChunk.document_id == document_id)
            .order_by(DocumentChunk.chunk_index.asc())
            .limit(40)
        )
    ).scalars().all()
    parts: list[str] = []
    total = 0
    for content in rows:
        text = (content or "").strip()[: DOC_EXCERPT_CHARS - total]
        if not text:
            continue
        parts.append(text)
        total += len(text)
        if total >= DOC_EXCERPT_CHARS:
            break
    return "\n".join(parts)


async def enqueue_report_generation(db: AsyncSession, report: Report) -> None:
    """Đưa report (đang pending) vào hàng đợi worker; không xếp được → failed."""
    try:
        await create_job(
            JOB_TYPE,
            {"report_id": report.id, "requested_at": report.updated_at.isoformat()},
        )
    except Exception:  # noqa: BLE001 — Redis down không được làm hỏng request
        logger.exception("Không tạo được job %s cho report %s", JOB_TYPE, report.id)
        report.generation_status = "failed"
        report.generation_error = "Không đưa được yêu cầu vào hàng đợi xử lý. Vui lòng thử lại."
        report.updated_at = datetime.utcnow()
        await db.commit()


def _is_current_request(report: Report, requested_at: Optional[str]) -> bool:
    """Job cũ (đã có yêu cầu tổng hợp mới hơn) không được ghi đè kết quả."""
    return not requested_at or (
        report.updated_at is not None and report.updated_at.isoformat() == requested_at
    )


async def _mark_failed(report_id: int, requested_at: Optional[str], error: str) -> None:
    async with async_session_maker() as db:
        report = await db.get(Report, report_id)
        if report is None or not _is_current_request(report, requested_at):
            return
        report.generation_status = "failed"
        report.generation_error = error[:500]
        report.updated_at = datetime.utcnow()
        await db.commit()


async def generate_ai_review(report_id: int, requested_at: Optional[str] = None) -> dict[str, Any]:
    """AI tổng hợp nhận xét định tính cho 1 report (chạy trong worker)."""
    async with async_session_maker() as db:
        report = await db.get(Report, report_id)
        if report is None:
            return {"report_id": report_id, "status": "missing"}
        if not _is_current_request(report, requested_at):
            return {"report_id": report_id, "status": "superseded"}
        transcript = list(report.transcript or [])
        rubric = await get_rubric_by_key(db, RUBRIC_KEY)
        rubric_cfg = dict(rubric.config) if rubric else {}
        rubric_version = rubric.version if rubric else None
        excerpt = await _document_excerpt(db, report.document_id) if report.document_id else ""
        provider, model = await resolve_feature_ai(db, "feedback")

    try:
        if not rubric_cfg.get("quality_criteria"):
            raise RuntimeError(f"Rubric {RUBRIC_KEY} chưa được seed/kích hoạt")
        if not has_student_answer(transcript):
            raise ValueError("Phiên chưa có câu trả lời nào của sinh viên")
        system_prompt, prompt = build_report_prompts(
            rubric_cfg, format_transcript_for_prompt(transcript), excerpt
        )
        ai_result = await ai_gateway.generate(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=0.2,
            # Model reasoning tiêu phần lớn max_tokens cho `reasoning` (xem
            # handlers/workspace_questions.py) — chừa đủ chỗ cho JSON trả về.
            max_tokens=12000,
            provider=provider,
            model=model,
        )
        review = normalize_ai_review(extract_json_object(ai_result.get("content", "")), rubric_cfg)
    except Exception as exc:
        logger.exception("Mock report %s: AI tổng hợp thất bại", report_id)
        await _mark_failed(report_id, requested_at, str(exc).strip() or type(exc).__name__)
        raise

    async with async_session_maker() as db:
        report = await db.get(Report, report_id)
        if report is None or not _is_current_request(report, requested_at):
            return {"report_id": report_id, "status": "superseded"}
        report.ai_feedback = review["overall_comment"] or None
        report.quality_criteria = review["quality_criteria"]
        report.strengths = review["strengths"]
        report.weaknesses = review["weaknesses"]
        report.action_items = review["action_items"]
        report.clo_breakdown = review["clo_coverage"]
        report.rubric_version = rubric_version
        report.generation_status = "ready"
        report.generation_error = None
        report.updated_at = datetime.utcnow()
        await db.commit()

    return {
        "report_id": report_id,
        "status": "ready",
        "provider": ai_result.get("provider", "default"),
        "model": ai_result.get("model", "default"),
    }
