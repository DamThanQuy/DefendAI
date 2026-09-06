"""Router cho code review / source code scan.

POST /api/code/scan        → tạo CodeAnalysis (queued) + enqueue job, trả 202 + analysis_id
GET  /api/code/analyses/{id} → poll trạng thái + kết quả (issues) của analysis
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.entities import (
    CodeAnalysis,
    CodeAnalysisIssue,
    CodeAnalysisStatus,
    DocType,
    Document,
    User,
)
from app.schemas.code_scan import (
    CodeAnalysisListItem,
    CodeAnalysisListResponse,
    CodeAnalysisStatsResponse,
    CodeAnalysisStatusResponse,
    CodeAnalysisIssueOut,
    CodeScanRequest,
    CodeScanSubmitResponse,
)
from app.services.job_queue import create_job

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/code", tags=["Code Review"])


@router.post(
    "/scan",
    response_model=CodeScanSubmitResponse,
    status_code=202,
    summary="Quét source code từ ZIP document (async map-reduce)",
    description=(
        "Tạo CodeAnalysis record (status=queued) rồi enqueue job code_scan_async. "
        "Dùng GET /api/code/analyses/{analysis_id} để poll kết quả."
    ),
)
async def scan_code(req: CodeScanRequest, db: AsyncSession = Depends(get_db)) -> CodeScanSubmitResponse:
    result = await db.execute(select(Document).where(Document.id == req.document_id))
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail=f"Document {req.document_id} not found")
    if document.doc_type != DocType.ZIP:
        raise HTTPException(status_code=400, detail="Code review chỉ hỗ trợ document type ZIP/RAR")

    analysis = CodeAnalysis(
        document_id=req.document_id,
        status=CodeAnalysisStatus.queued,
        provider=req.provider,
        model=req.model,
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    job_id = await create_job("code_scan_async", {
        "analysis_id": analysis.id,
        "document_id": req.document_id,
        "provider": req.provider,
        "model": req.model,
    })

    return CodeScanSubmitResponse(analysis_id=analysis.id, job_id=job_id, status="queued")


@router.get(
    "/analyses/{analysis_id}",
    response_model=CodeAnalysisStatusResponse,
    summary="Lấy trạng thái và kết quả code review theo analysis_id",
)
async def get_analysis(analysis_id: int, db: AsyncSession = Depends(get_db)) -> CodeAnalysisStatusResponse:
    result = await db.execute(select(CodeAnalysis).where(CodeAnalysis.id == analysis_id))
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail=f"Analysis {analysis_id} not found")

    issues_out: list[CodeAnalysisIssueOut] = []
    # Đề xuất 5: stream heuristic issues sớm khi status=processing → FE render ngay
    if analysis.status in (CodeAnalysisStatus.processing, CodeAnalysisStatus.completed):
        res = await db.execute(
            select(CodeAnalysisIssue)
            .where(CodeAnalysisIssue.analysis_id == analysis_id)
            .order_by(CodeAnalysisIssue.id)
        )
        issues_out = [
            CodeAnalysisIssueOut(
                id=i.id,
                module=i.module,
                file=i.file,
                line=i.line,
                type=i.type,
                severity=i.severity,
                description=i.description,
                suggestion=i.suggestion,
            )
            for i in res.scalars().all()
        ]

    return CodeAnalysisStatusResponse(
        analysis_id=analysis.id,
        document_id=analysis.document_id,
        status=analysis.status.value,
        summary=analysis.summary,
        total_files=analysis.total_files,
        total_modules=analysis.total_modules or 0,
        done_modules=analysis.done_modules or 0,
        stats=analysis.stats_json,
        error=analysis.error,
        issues=issues_out,
    )


@router.get(
    "/analyses",
    response_model=CodeAnalysisListResponse,
    summary="Lịch sử code review của user hiện tại (theo document đã upload)",
)
async def list_analyses(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CodeAnalysisListResponse:
    result = await db.execute(
        select(CodeAnalysis, Document.filename)
        .join(Document, Document.id == CodeAnalysis.document_id)
        .where(Document.uploaded_by == user.id)
        .order_by(CodeAnalysis.created_at.desc())
    )
    analyses = [
        CodeAnalysisListItem(
            analysis_id=a.id,
            document_id=a.document_id,
            document_name=doc_name,
            status=a.status.value,
            total_files=a.total_files,
            stats=a.stats_json,
            provider=a.provider,
            model=a.model,
            created_at=a.created_at.isoformat() if a.created_at else None,
        )
        for a, doc_name in result.all()
    ]
    return CodeAnalysisListResponse(analyses=analyses)


@router.get(
    "/analyses/{analysis_id}/stats",
    response_model=CodeAnalysisStatsResponse,
    summary="Thống kê severity của một analysis (reduce endpoint)",
)
async def get_analysis_stats(analysis_id: int, db: AsyncSession = Depends(get_db)) -> CodeAnalysisStatsResponse:
    analysis = (await db.execute(select(CodeAnalysis).where(CodeAnalysis.id == analysis_id))).scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail=f"Analysis {analysis_id} not found")

    rows = await db.execute(
        select(CodeAnalysisIssue.severity, func.count(CodeAnalysisIssue.id))
        .where(CodeAnalysisIssue.analysis_id == analysis_id)
        .group_by(CodeAnalysisIssue.severity)
    )
    stats = {row[0].lower(): row[1] for row in rows.all() if row[0]}
    total = sum(stats.values())

    return CodeAnalysisStatsResponse(
        analysis_id=analysis.id,
        status=analysis.status.value,
        stats=stats,
        total_issues=total,
    )