"""Handler cho job type 'code_scan': xử lý ZIP code review trong background."""
from __future__ import annotations

import logging

from sqlalchemy import select

from app.core.database import async_session_maker
from app.models.entities import CodeAnalysis, DocType, Document, DocumentStatus
from app.services.code_scanner import (
    CodeScanError,
    agent_fast_check,
    analyze_code_document,
    classify_archive,
    decide_source_code,
    list_archive_members,
)
from app.services.job_queue import register_handler

logger = logging.getLogger(__name__)


@register_handler("code_scan")
async def handle_code_scan(params: dict) -> dict:
    document_id: int = params["document_id"]
    provider: str | None = params.get("provider")
    model: str | None = params.get("model")

    async with async_session_maker() as db:
        result = await db.execute(select(Document).where(Document.id == document_id))
        document = result.scalar_one_or_none()
        if not document:
            raise CodeScanError(f"Document {document_id} not found")

        if document.doc_type != DocType.ZIP:
            raise CodeScanError("Code review chỉ hỗ trợ document type ZIP")

        document.status = DocumentStatus.processing
        await db.commit()

        try:
            # Bước 1: Phân loại nội dung file nén (static, không tốn LLM)
            member_names = await list_archive_members(document)
            classification = classify_archive(member_names)
            decision = decide_source_code(classification)

            if decision == "reject":
                raise CodeScanError(
                    "File nén không chứa mã nguồn (chỉ có tài liệu/cấu hình). "
                    "Code Review chỉ hỗ trợ source code dự án. "
                    "Bạn có thể dùng luồng Đọc Tài liệu để tạo câu hỏi."
                )

            # Bước 2: Case mơ hồ → Agent Fast-Check (LLM đọc tree + snippet)
            if decision == "ambiguous":
                verdict = await agent_fast_check(document, classification)
                if not verdict.get("is_source_code"):
                    raise CodeScanError(
                        verdict.get("reason")
                        or "File nén không được xác định là source code dự án. "
                           "Bạn có thể dùng luồng Đọc Tài liệu để tạo câu hỏi."
                    )
                classification["primary_language"] = verdict.get("primary_language", "")

            analysis_result = await analyze_code_document(document, provider=provider, model=model)
            issues = analysis_result["issues"]

            code_analysis = CodeAnalysis(
                document_id=document.id,
                issues=issues,
                summary=analysis_result["summary"],
                pass_rate=int(round(float(analysis_result["pass_rate"]))),
            )
            db.add(code_analysis)
            document.status = DocumentStatus.completed
            await db.commit()
            await db.refresh(code_analysis)
            await db.refresh(document)

            return {
                "analysis_id": code_analysis.id,
                "document_id": document.id,
                "document_name": document.filename,
                "status": document.status.value,
                "summary": analysis_result["summary"],
                "pass_rate": float(analysis_result["pass_rate"]),
                "files_scanned": len({issue["file"] for issue in issues}) if issues else 0,
                "issues": issues,
                "provider": analysis_result.get("provider"),
                "model": analysis_result.get("model"),
            }
        except CodeScanError as exc:
            document.status = DocumentStatus.failed
            await db.commit()
            raise
        except Exception as exc:
            logger.exception("Code scan failed for document %s", document.id)
            document.status = DocumentStatus.failed
            await db.commit()
            raise
