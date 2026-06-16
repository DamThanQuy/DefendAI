"""Router cho code review / source code scan."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.entities import CodeAnalysis, DocType, Document, DocumentStatus
from app.schemas.code_scan import CodeScanRequest, CodeScanResponse
from app.services.code_scanner import CodeScanError, analyze_code_document


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/code", tags=["Code Review"])


@router.post(
    "/scan",
    response_model=CodeScanResponse,
    summary="Quét source code từ ZIP document",
    description="Đọc ZIP source code, review bằng AI và lưu kết quả vào code_analyses.",
)
async def scan_code(req: CodeScanRequest, db: AsyncSession = Depends(get_db)) -> CodeScanResponse:
    result = await db.execute(select(Document).where(Document.id == req.document_id))
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail=f"Document {req.document_id} not found")

    if document.doc_type != DocType.ZIP:
        raise HTTPException(status_code=400, detail="Code review chỉ hỗ trợ document type ZIP")

    document.status = DocumentStatus.processing
    await db.commit()
    await db.refresh(document)

    try:
        analysis_result = await analyze_code_document(document, provider=req.provider, model=req.model)
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

        return CodeScanResponse(
            analysis_id=code_analysis.id,
            document_id=document.id,
            document_name=document.filename,
            status=document.status.value,
            summary=analysis_result["summary"],
            pass_rate=float(analysis_result["pass_rate"]),
            files_scanned=len({issue["file"] for issue in issues}) or 0,
            issues=issues,
            provider=analysis_result.get("provider"),
            model=analysis_result.get("model"),
        )
    except CodeScanError as exc:
        document.status = DocumentStatus.failed
        await db.commit()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        document.status = DocumentStatus.failed
        await db.commit()
        raise
    except Exception as exc:
        logger.exception("Failed to scan code for document %s", document.id)
        document.status = DocumentStatus.failed
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Code scan failed: {type(exc).__name__}: {exc}") from exc
