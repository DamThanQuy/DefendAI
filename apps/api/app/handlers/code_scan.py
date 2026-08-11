"""Handlers cho pipeline code review (map-reduce cho 100k file).

L1 Route (POST /api/code/scan) tạo CodeAnalysis (status=queued) + enqueue job
   `code_scan_async` → trả 202 + analysis_id.
L2 Orchestrator (handle_code_scan, job type `code_scan_async`):
   - classify ZIP (static) → reject/ambiguous path.
   - extract TẤT CẢ file (không cap), heuristic pass-1 ghi code_analysis_issues.
   - _split_into_module_jobs → N module (mỗi ≤ MODULE_FILE_CAP file).
   - fan-out N job `code_scan_module` (chứa nội dung file → worker không cần đọc lại MinIO).
L3 Module worker (handle_code_scan_module, job type `code_scan_module`):
   - 1 LLM call/module → ghi code_analysis_issues, increment done_modules (atomic).
   - khi done_modules == total_modules → Reduce (aggregate, không LLM).
FE poll GET /api/code/analyses/{id}.
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker
from app.handlers.code_scan_helpers import (
    _module_issues_to_rows,
    _reduce_analysis,
)
from app.models.entities import (
    CodeAnalysis,
    CodeAnalysisIssue,
    CodeAnalysisStatus,
    DocType,
    Document,
    DocumentStatus,
)
from app.services.code_scanner import (
    CodeScanError,
    ScannedFile,
    _split_into_module_jobs,
    agent_fast_check,
    analyze_module_files,
    classify_archive,
    decide_source_code,
    extract_code_files,
    list_archive_members,
)
from app.services.job_queue import create_job, register_handler

logger = logging.getLogger(__name__)


@register_handler("code_scan_async")
async def handle_code_scan(params: dict) -> dict:
    """Orchestrator: classify → extract all → heuristic pass-1 → fan-out modules."""
    analysis_id: int = params["analysis_id"]
    document_id: int = params["document_id"]
    provider: str | None = params.get("provider")
    model: str | None = params.get("model")

    async with async_session_maker() as db:
        analysis = await _lock_analysis(db, analysis_id)
        if analysis is None:
            logger.error("CodeAnalysis %s disappeared before processing", analysis_id)
            return {"analysis_id": analysis_id, "status": "failed"}

        document = await _load_document(db, document_id)
        if document is None or document.doc_type != DocType.ZIP:
            await _fail(db, analysis, document, "Code review chỉ hỗ trợ document type ZIP/RAR")
            return {"analysis_id": analysis_id, "status": "failed"}

        try:
            # L2.1 static classification
            member_names = await list_archive_members(document)
            classification = classify_archive(member_names)
            decision = decide_source_code(classification)

            if decision == "reject":
                await _fail(
                    db, analysis, document,
                    "File nén không chứa mã nguồn (chỉ có tài liệu/cấu hình). "
                    "Bạn có thể dùng luồng Đọc Tài liệu để tạo câu hỏi.",
                )
                return {"analysis_id": analysis_id, "status": "rejected"}

            if decision == "ambiguous":
                verdict = await agent_fast_check(document, classification)
                if not verdict.get("is_source_code"):
                    await _fail(db, analysis, document, verdict.get("reason")
                                or "File nén không được xác định là source code dự án.")
                    return {"analysis_id": analysis_id, "status": "rejected"}

            # L2.2 extract ALL files (no cap)
            files = await extract_code_files(document)
            analysis.total_files = len(files)
            analysis.status = CodeAnalysisStatus.processing
            analysis.provider = provider
            analysis.model = model
            await db.commit()

            # Pass-1 heuristic (no LLM) — writes code_analysis_issues immediately
            await _write_heuristic_pass1(db, analysis_id, files)

            # L2.3 split into module jobs (each ≤ MODULE_FILE_CAP files)
            module_jobs = _split_into_module_jobs(files, module_cap=40)
            analysis.total_modules = len(module_jobs)
            analysis.done_modules = 0
            await db.commit()

            if not module_jobs:
                await _reduce_analysis(db, analysis_id)
                return {"analysis_id": analysis_id, "status": "completed"}

            for module_name, module_files in module_jobs:
                payload = {
                    "analysis_id": analysis_id,
                    "document_id": document_id,
                    "module": module_name,
                    "files": [{"path": f.path, "content": f.content} for f in module_files],
                    "provider": provider,
                    "model": model,
                }
                await create_job("code_scan_module", payload)

            return {"analysis_id": analysis_id, "status": "processing", "total_modules": len(module_jobs)}
        except CodeScanError as exc:
            await _fail(db, analysis, document, str(exc))
            return {"analysis_id": analysis_id, "status": "failed", "error": str(exc)}
        except Exception as exc:  # noqa: BLE001
            logger.exception("Code scan orchestrator failed for document %s", document_id)
            await _fail(db, analysis, document, f"Lỗi hệ thống: {exc}")
            return {"analysis_id": analysis_id, "status": "failed", "error": str(exc)}


@register_handler("code_scan_module")
async def handle_code_scan_module(params: dict) -> dict:
    """L3 module worker: 1 LLM call → write issues → atomic done_modules increment → reduce."""
    analysis_id: int = params["analysis_id"]
    module: str = params["module"]
    provider: str | None = params.get("provider")
    model: str | None = params.get("model")
    files = [ScannedFile(path=f["path"], content=f["content"]) for f in params.get("files", [])]

    async with async_session_maker() as db:
        try:
            issues = await analyze_module_files(files, provider=provider, model=model)
            await _module_issues_to_rows(db, analysis_id, module, issues)

            # Atomic increment + read back the new value
            result = await db.execute(
                update(CodeAnalysis)
                .where(CodeAnalysis.id == analysis_id)
                .values(done_modules=CodeAnalysis.done_modules + 1)
                .returning(CodeAnalysis.done_modules, CodeAnalysis.total_modules)
            )
            row = result.first()
            await db.commit()

            if row and row.done_modules >= (row.total_modules or 0):
                await _reduce_analysis(db, analysis_id)

            return {"analysis_id": analysis_id, "module": module, "issues": len(issues)}
        except Exception as exc:  # noqa: BLE001
            logger.exception("Code scan module %s failed (analysis %s)", module, analysis_id)
            # Still increment done_modules so reduce fires even if some modules fail.
            try:
                result = await db.execute(
                    update(CodeAnalysis)
                    .where(CodeAnalysis.id == analysis_id)
                    .values(done_modules=CodeAnalysis.done_modules + 1)
                    .returning(CodeAnalysis.done_modules, CodeAnalysis.total_modules)
                )
                row = result.first()
                await db.commit()
                if row and row.done_modules >= (row.total_modules or 0):
                    await _reduce_analysis(db, analysis_id)
            except Exception:
                await db.rollback()
            return {"analysis_id": analysis_id, "module": module, "error": str(exc)}


# ───────────────────────────────────────────────────────────── helpers ──

async def _lock_analysis(db: AsyncSession, analysis_id: int) -> CodeAnalysis | None:
    result = await db.execute(select(CodeAnalysis).where(CodeAnalysis.id == analysis_id))
    return result.scalar_one_or_none()


async def _load_document(db: AsyncSession, document_id: int) -> Document | None:
    result = await db.execute(select(Document).where(Document.id == document_id))
    return result.scalar_one_or_none()


async def _write_heuristic_pass1(db: AsyncSession, analysis_id: int, files: list) -> None:
    from app.services.code_scanner import _heuristic_scan, _module_of_path

    heuristic = _heuristic_scan(files)
    for issue in heuristic.get("issues", []):
        db.add(CodeAnalysisIssue(
            analysis_id=analysis_id,
            module=_module_of_path(issue["file"]),
            file=issue["file"],
            line=issue["line"],
            type=issue["type"],
            severity=issue["severity"],
            description=issue["description"],
            suggestion=issue["suggestion"],
        ))
    await db.commit()


async def _fail(
    db: AsyncSession,
    analysis: CodeAnalysis,
    document: Document | None,
    error: str,
) -> None:
    analysis.status = CodeAnalysisStatus.failed
    analysis.error = error
    if document is not None:
        document.status = DocumentStatus.failed
    await db.commit()