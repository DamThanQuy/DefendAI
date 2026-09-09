"""Router for Step 2 — ZIP/BR consistency analysis lifecycle.

Endpoints:

- ``POST /api/workspaces/{workspace_id}/analysis`` — tạo AnalysisJob từ ZIP
  document + danh sách requirement document ids.
- ``GET  /api/analysis/{job_id}`` — trạng thái, progress, summary.
- ``GET  /api/analysis/{job_id}/results`` — manifest summary + evidence rows.
- ``POST /api/analysis/{job_id}/retry`` — re-run với cùng input hash.

Idempotency: nếu input hash đã tồn tại job hoàn thành, endpoint ``POST`` trả
về job cũ thay vì tạo mới. Worker job sẽ được tạo mới mỗi lần retry.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.entities import (
    AnalysisJob,
    AnalysisStatus,
    DocType,
    Document,
    ProjectEvidence,
    ProjectManifest,
    RequirementMatch,
    User,
)
from app.services.job_queue import create_job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Analysis"])


ANALYZER_VERSION = "step4-v1"


# ──────────────────────────────────────────────────────────── schemas ──


class AnalysisCreateRequest(BaseModel):
    zip_document_id: int = Field(..., description="ZIP document id đã upload")
    requirement_document_ids: list[int] = Field(
        default_factory=list,
        description="Danh sách document id chứa BR/SRS/Use Case",
    )


class AnalysisCreateResponse(BaseModel):
    analysis_job_id: int
    worker_job_id: str
    status: str
    idempotent_reused: bool = False
    input_hash: str


class AnalysisStatusOut(BaseModel):
    analysis_job_id: int
    workspace_id: int
    status: str
    current_step: str | None = None
    progress: int = 0
    error: str | None = None
    framework: str | None = None
    selection_mode: str | None = None
    evidence_rows: int | None = None
    evidence_rows_total: int | None = None
    selected_files: int | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None


class EvidenceOut(BaseModel):
    id: int
    path: str
    language: str | None
    symbol_name: str
    symbol_kind: str
    line_start: int | None
    line_end: int | None
    routes: list[str] = []
    calls: list[str] = []
    keywords: list[str] = []
    snippet: str


class AnalysisResultsResponse(BaseModel):
    analysis_job_id: int
    workspace_id: int
    status: str
    framework: str | None = None
    selection_mode: str | None = None
    warnings: list[str] = []
    selected_files: list[dict] = []
    evidence: list[EvidenceOut] = []


class RequirementMatchOut(BaseModel):
    id: int
    requirement_code: str
    requirement_title: str
    status: str
    confidence: int
    evidence: list[dict] = []
    missing_evidence: list[str] = []
    # Step 4 — AI explanation
    reason: str | None = None
    reason_provider: str | None = None
    reason_model: str | None = None
    reason_fallback: str | None = None


class RequirementMatchesResponse(BaseModel):
    analysis_job_id: int
    workspace_id: int
    status: str
    total: int
    matched: int
    partial: int
    not_found: int
    insufficient_evidence: int
    matches: list[RequirementMatchOut] = []


class AnalysisRetryResponse(BaseModel):
    analysis_job_id: int
    worker_job_id: str
    status: str


# ──────────────────────────────────────────────────────────── helpers ──


def _hash_input(zip_sha256: str, requirement_sha256: str, version: str) -> str:
    payload = f"{zip_sha256}|{requirement_sha256}|{version}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


async def _compute_requirements_hash(
    db: AsyncSession,
    requirement_ids: list[int],
) -> tuple[str, list[int]]:
    """Return SHA256 of concatenated requirement hashes + validated id list.

    Documents without a ``content_hash`` are read from MinIO if available; if
    that fails we fall back to a stable hash over ``(id, filename)`` so the
    input hash is reproducible.
    """
    if not requirement_ids:
        return hashlib.sha256(b"").hexdigest(), []
    result = await db.execute(
        select(Document).where(Document.id.in_(requirement_ids))
    )
    documents = {d.id: d for d in result.scalars().all()}
    ordered_ids = sorted(set(documents))
    parts: list[str] = []
    for doc_id in ordered_ids:
        doc = documents[doc_id]
        parts.append(f"{doc.id}:{doc.content_hash or doc.filename}")
    joined = "|".join(parts).encode("utf-8")
    return hashlib.sha256(joined).hexdigest(), ordered_ids


async def _owned_workspace_or_404(
    db: AsyncSession, workspace_id: int, user: User
):
    from app.models.entities import Workspace

    result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id, Workspace.user_id == user.id)
    )
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace không tồn tại")
    return workspace


# ──────────────────────────────────────────────────────────── endpoints ──


@router.post(
    "/workspaces/{workspace_id}/analysis",
    response_model=AnalysisCreateResponse,
    status_code=201,
    summary="Tạo AnalysisJob cho workspace (idempotent theo input hash).",
)
async def create_analysis(
    workspace_id: int,
    req: AnalysisCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnalysisCreateResponse:
    await _owned_workspace_or_404(db, workspace_id, user)

    zip_doc = (
        await db.execute(select(Document).where(Document.id == req.zip_document_id))
    ).scalar_one_or_none()
    if zip_doc is None:
        raise HTTPException(status_code=404, detail="ZIP document không tồn tại")
    if zip_doc.doc_type != DocType.ZIP:
        raise HTTPException(status_code=400, detail="Document phải là ZIP")
    req_hash, ordered_req_ids = await _compute_requirements_hash(db, req.requirement_document_ids)
    # Fallback hash khi content_hash chưa được tính (file cũ hoặc test data).
    # Dùng id+filename để đảm bảo deterministic cho cùng document.
    zip_hash = zip_doc.content_hash or hashlib.sha256(
        f"{zip_doc.id}:{zip_doc.filename}".encode()
    ).hexdigest()
    input_hash = _hash_input(zip_hash, req_hash, ANALYZER_VERSION)

    existing = (
        await db.execute(
            select(AnalysisJob).where(
                AnalysisJob.input_hash == input_hash,
                AnalysisJob.workspace_id == workspace_id,
            )
        )
    ).scalars().all()
    reusable = next(
        (j for j in existing if j.status in {AnalysisStatus.completed, AnalysisStatus.partial}),
        None,
    )
    if reusable is not None:
        worker_job_id = await create_job(
            "analysis_pipeline", {"analysis_job_id": reusable.id}
        )
        return AnalysisCreateResponse(
            analysis_job_id=reusable.id,
            worker_job_id=worker_job_id,
            status=reusable.status.value,
            idempotent_reused=True,
            input_hash=input_hash,
        )

    analysis = AnalysisJob(
        workspace_id=workspace_id,
        user_id=user.id,
        zip_document_id=zip_doc.id,
        requirement_document_ids=ordered_req_ids,
        zip_sha256=zip_hash,
        requirements_sha256=req_hash,
        analyzer_version=ANALYZER_VERSION,
        input_hash=input_hash,
        status=AnalysisStatus.queued,
    )
    db.add(analysis)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Không thể tạo analysis job")
    await db.refresh(analysis)

    worker_job_id = await create_job(
        "analysis_pipeline", {"analysis_job_id": analysis.id}
    )
    analysis.worker_job_id = worker_job_id
    await db.commit()
    # Step 3 (M2) matching will be enqueued automatically by the worker
    # once ``analysis_pipeline`` reports status == completed. See
    # ``app/handlers/analysis_pipeline.py`` for the dispatch call.
    return AnalysisCreateResponse(
        analysis_job_id=analysis.id,
        worker_job_id=worker_job_id,
        status=AnalysisStatus.queued.value,
        idempotent_reused=False,
        input_hash=input_hash,
    )


@router.get(
    "/analysis/{job_id}",
    response_model=AnalysisStatusOut,
    summary="Lấy trạng thái AnalysisJob.",
)
async def get_analysis_status(
    job_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnalysisStatusOut:
    analysis = await _load_owned_analysis(db, job_id, user)
    manifest = await _load_manifest(db, analysis.id)
    summary = analysis.summary or {}
    return AnalysisStatusOut(
        analysis_job_id=analysis.id,
        workspace_id=analysis.workspace_id,
        status=analysis.status.value,
        current_step=analysis.current_step,
        progress=analysis.progress,
        error=analysis.error,
        framework=manifest.framework if manifest else None,
        selection_mode=manifest.selection_mode if manifest else None,
        evidence_rows=summary.get("evidence_rows"),
        evidence_rows_total=summary.get("evidence_rows_total"),
        selected_files=summary.get("selected_files"),
        created_at=analysis.created_at,
        started_at=analysis.started_at,
        finished_at=analysis.finished_at,
    )


@router.get(
    "/analysis/{job_id}/results",
    response_model=AnalysisResultsResponse,
    summary="Lấy kết quả manifest + evidence rows của AnalysisJob.",
)
async def get_analysis_results(
    job_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnalysisResultsResponse:
    analysis = await _load_owned_analysis(db, job_id, user)
    manifest = await _load_manifest(db, analysis.id)
    evidence_rows = (
        await db.execute(
            select(ProjectEvidence)
            .where(ProjectEvidence.analysis_job_id == analysis.id)
            .order_by(ProjectEvidence.path, ProjectEvidence.line_start)
            .limit(500)
        )
    ).scalars().all()

    manifest_dict = manifest.manifest_json if manifest else {}
    selected_files = manifest_dict.get("files", []) if isinstance(manifest_dict, dict) else []
    return AnalysisResultsResponse(
        analysis_job_id=analysis.id,
        workspace_id=analysis.workspace_id,
        status=analysis.status.value,
        framework=manifest.framework if manifest else None,
        selection_mode=manifest.selection_mode if manifest else None,
        warnings=manifest.warnings_json if manifest and manifest.warnings_json else [],
        selected_files=[
            {k: v for k, v in f.items() if k != "skip_reason"} for f in selected_files
        ],
        evidence=[
            EvidenceOut(
                id=row.id,
                path=row.path,
                language=row.language,
                symbol_name=row.symbol_name,
                symbol_kind=row.symbol_kind,
                line_start=row.line_start,
                line_end=row.line_end,
                routes=row.routes_json or [],
                calls=row.calls_json or [],
                keywords=row.keywords_json or [],
                snippet=row.snippet,
            )
            for row in evidence_rows
        ],
    )


@router.get(
    "/analysis/{job_id}/matches",
    response_model=RequirementMatchesResponse,
    summary="Lấy danh sách RequirementMatch sau Step 3 (M2).",
)
async def get_analysis_matches(
    job_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RequirementMatchesResponse:
    analysis = await _load_owned_analysis(db, job_id, user)
    match_rows = (
        await db.execute(
            select(RequirementMatch)
            .where(RequirementMatch.analysis_job_id == analysis.id)
            .order_by(RequirementMatch.requirement_code)
            .limit(1000)
        )
    ).scalars().all()

    matched = sum(1 for m in match_rows if m.status.value == "matched")
    partial = sum(1 for m in match_rows if m.status.value == "partial")
    not_found = sum(1 for m in match_rows if m.status.value == "not_found")
    insufficient = sum(1 for m in match_rows if m.status.value == "insufficient_evidence")
    return RequirementMatchesResponse(
        analysis_job_id=analysis.id,
        workspace_id=analysis.workspace_id,
        status=analysis.status.value,
        total=len(match_rows),
        matched=matched,
        partial=partial,
        not_found=not_found,
        insufficient_evidence=insufficient,
        matches=[
            RequirementMatchOut(
                id=row.id,
                requirement_code=row.requirement_code,
                requirement_title=row.requirement_title,
                status=row.status.value,
                confidence=row.confidence,
                evidence=row.evidence_json or [],
                missing_evidence=row.missing_evidence_json or [],
                # Step 4 fields
                reason=row.reason,
                reason_provider=row.reason_provider,
                reason_model=row.reason_model,
                reason_fallback=row.reason_fallback,
            )
            for row in match_rows
        ],
    )


@router.post(
    "/analysis/{job_id}/retry",
    response_model=AnalysisRetryResponse,
    summary="Re-run AnalysisJob (giữ nguyên input hash).",
)
async def retry_analysis(
    job_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnalysisRetryResponse:
    analysis = await _load_owned_analysis(db, job_id, user)
    if analysis.status in {AnalysisStatus.queued, AnalysisStatus.extracting, AnalysisStatus.indexing, AnalysisStatus.matching}:
        raise HTTPException(
            status_code=409,
            detail=f"Job đang chạy (status={analysis.status.value}), không thể retry",
        )
    analysis.status = AnalysisStatus.queued
    analysis.progress = 0
    analysis.current_step = "queued"
    analysis.error = None
    analysis.started_at = None
    analysis.finished_at = None
    await db.commit()
    worker_job_id = await create_job(
        "analysis_pipeline", {"analysis_job_id": analysis.id}
    )
    analysis.worker_job_id = worker_job_id
    await db.commit()
    return AnalysisRetryResponse(
        analysis_job_id=analysis.id,
        worker_job_id=worker_job_id,
        status=AnalysisStatus.queued.value,
    )


# ──────────────────────────────────────────────────────────── helpers ──


async def _load_owned_analysis(
    db: AsyncSession,
    job_id: int,
    user: User,
) -> AnalysisJob:
    result = await db.execute(
        select(AnalysisJob).where(AnalysisJob.id == job_id)
    )
    analysis = result.scalar_one_or_none()
    if analysis is None:
        raise HTTPException(status_code=404, detail="Analysis job không tồn tại")
    if analysis.user_id != user.id:
        raise HTTPException(status_code=403, detail="Không có quyền truy cập analysis job này")
    return analysis


async def _load_manifest(
    db: AsyncSession,
    analysis_job_id: int,
) -> ProjectManifest | None:
    result = await db.execute(
        select(ProjectManifest).where(ProjectManifest.analysis_job_id == analysis_job_id)
    )
    return result.scalar_one_or_none()


# Re-export hash util for tests
__all__ = [
    "router",
    "create_analysis",
    "get_analysis_status",
    "get_analysis_results",
    "retry_analysis",
    "_hash_input",
    "_compute_requirements_hash",
]


# Silence linter about unused json import — kept for future serializer helpers
_ = json