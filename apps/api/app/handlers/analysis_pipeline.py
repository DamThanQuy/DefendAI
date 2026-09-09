"""Worker handler that runs Step 2 of the ZIP/BR analysis pipeline.

Pipeline (deterministic, no LLM):

  1. Load ``AnalysisJob`` (workspace, ZIP document, requirements).
  2. Download + validate ZIP via ``extract_selected_zip_from_minio``.
  3. Build ``ProjectManifest`` (file inventory + framework + skip reasons).
  4. Run deterministic ``source_indexer`` over selected files.
  5. Embed function/class/route evidence via Google Gemini embedding.
  6. Persist manifest + evidence rows + update job status.
  7. Cleanup temp directory.

LLM is NOT called here. Step 3 (heuristic + optional AI review) will pick up
the persisted evidence rows.
"""
from __future__ import annotations

import logging
import os
import shutil
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import async_session_maker
from app.models.entities import (
    AnalysisJob,
    AnalysisStatus,
    DocType,
    Document,
    ProjectEvidence,
    ProjectManifest,
)
from app.services.analysis_storage import StorageUnavailable
from app.services.archive_extractor import (
    cleanup_stale_extraction_dirs,
    extract_selected_zip_from_minio,
)
from app.services.archive_validator import ArchiveLimits
from app.services.embedder import EMBEDDING_MODEL, embed
from app.services.job_queue import create_job, register_handler
from app.services.project_manifest import build_project_manifest
from app.services.source_indexer import (
    EvidenceSnippet,
    index_source_files,
    snippet_to_embedding_text,
)

logger = logging.getLogger(__name__)

# Cap số snippet được embed cho 1 job. Repo lớn (vd source code của chính dự án)
# sinh hàng nghìn snippet → embedding tuần tự có thể chạy >1 giờ. Matching chỉ
# cần bằng chứng đại diện, không cần toàn bộ — ưu tiên kind giá trị cao trước.
MAX_EMBED_SNIPPETS = int(os.getenv("ANALYSIS_MAX_EMBED_SNIPPETS", "2000"))

# Thứ tự ưu tiên embed: route/controller/service/model là bằng chứng mạnh nhất
# cho đối chiếu BR↔code; arrow/decorator là bổ sung.
_KIND_PRIORITY = {
    "route": 0,
    "class": 1,
    "function": 2,
    "method": 3,
    "arrow": 4,
    "decorator": 5,
}


def _prioritize_snippets(
    snippets: list[EvidenceSnippet], cap: int = MAX_EMBED_SNIPPETS
) -> list[EvidenceSnippet]:
    """Giữ tối đa ``cap`` snippet, ưu tiên theo symbol_kind rồi theo path."""
    if len(snippets) <= cap:
        return snippets
    ranked = sorted(
        snippets,
        key=lambda s: (_KIND_PRIORITY.get(s.symbol_kind, 9), s.path),
    )
    kept = ranked[:cap]
    logger.warning(
        "Snippet cap applied: %d → %d (dropped %d low-priority snippets)",
        len(snippets), len(kept), len(snippets) - len(kept),
    )
    return kept


@register_handler("analysis_pipeline")
async def handle_analysis_pipeline(params: dict[str, Any]) -> dict[str, Any]:
    """Run Step 2 analysis pipeline for one ``AnalysisJob``."""
    job_id = params.get("analysis_job_id")
    if not isinstance(job_id, int):
        raise ValueError("analysis_job_id (int) is required for analysis_pipeline")
    redis_job_id = params.get("_job_id")
    temp_dir = settings.archive_analysis.temp_dir
    cleanup_stale_extraction_dirs(temp_dir)

    async with async_session_maker() as db:
        analysis = await _load_analysis(db, job_id)
        if analysis is None:
            return {"analysis_job_id": job_id, "status": "failed", "error": "Analysis not found"}
        if analysis.status not in {AnalysisStatus.queued, AnalysisStatus.failed, AnalysisStatus.partial}:
            return {"analysis_job_id": job_id, "status": "skipped", "current": analysis.status.value}

        document = await _load_document(db, analysis.zip_document_id)
        if document is None or document.doc_type != DocType.ZIP:
            await _set_status(db, analysis, AnalysisStatus.rejected, error="Document không phải ZIP")
            return {"analysis_job_id": job_id, "status": "rejected"}

        try:
            return await _run_pipeline(db, analysis, document, redis_job_id)
        except StorageUnavailable as exc:
            await _set_status(db, analysis, AnalysisStatus.rejected, error=str(exc))
            return {"analysis_job_id": job_id, "status": "rejected", "error": str(exc)}
        except Exception as exc:  # noqa: BLE001
            logger.exception("Analysis pipeline failed for job %s", job_id)
            await _set_status(
                db, analysis, AnalysisStatus.failed,
                error=f"{type(exc).__name__}: {exc}",
            )
            return {"analysis_job_id": job_id, "status": "failed", "error": str(exc)}


async def _run_pipeline(
    db: AsyncSession,
    analysis: AnalysisJob,
    document: Document,
    redis_job_id: str | None,
) -> dict[str, Any]:
    job_id = str(analysis.id)
    await _set_status(db, analysis, AnalysisStatus.extracting, step="extracting", progress=10)

    extraction = await extract_selected_zip_from_minio(
        bucket=settings.minio.bucket,
        key=document.storage_key,
        job_id=job_id,
        temp_dir=settings.archive_analysis.temp_dir,
        limits=ArchiveLimits(
            max_archive_bytes=settings.archive_analysis.max_archive_bytes,
            max_expanded_bytes=settings.archive_analysis.max_expanded_bytes,
            max_entries=settings.archive_analysis.max_entries,
            max_entry_bytes=settings.archive_analysis.max_entry_bytes,
            max_compression_ratio=settings.archive_analysis.max_compression_ratio,
            max_nested_archive_depth=settings.archive_analysis.max_nested_archive_depth,
        ),
        timeout_seconds=settings.archive_analysis.timeout_seconds,
        cleanup=False,
    )

    try:
        await _set_status(db, analysis, AnalysisStatus.indexing, step="indexing", progress=40)

        manifest = build_project_manifest(extraction)
        framework = manifest["framework"]
        selection_mode = manifest["selection_mode"]

        # Read selected files into memory only for the indexer (Step 1 quota).
        files_for_indexer: list[tuple[str, str]] = []
        for ef in extraction.selected_files:
            try:
                text = ef.local_path.read_text(encoding="utf-8", errors="ignore")
            except OSError as exc:
                logger.warning("Cannot read %s: %s", ef.path, exc)
                continue
            files_for_indexer.append((ef.path, text))

        snippets: list[EvidenceSnippet] = index_source_files(files_for_indexer)
        total_snippets = len(snippets)
        snippets = _prioritize_snippets(snippets)

        await _set_status(db, analysis, AnalysisStatus.indexing, step="embedding", progress=70)

        embedding_vectors: list[list[float]] = []
        if snippets:
            # Progress nhích dần trong embedding (70→95) thay vì đứng yên ở 70
            # suốt hàng chục phút với repo lớn — callback được gọi mỗi batch.
            async def _embed_progress(done: int, total: int) -> None:
                pct = 70 + int(25 * done / max(total, 1))
                analysis.progress = min(pct, 95)
                analysis.current_step = f"embedding:{done}/{total}"
                await db.commit()

            try:
                embedding_vectors = await embed(
                    [snippet_to_embedding_text(s) for s in snippets],
                    on_progress=_embed_progress,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Embedder failed for job %s: %s — continuing without vectors", job_id, exc)
                embedding_vectors = [None] * len(snippets)  # type: ignore[assignment]

        # Persist manifest (replace existing if a previous attempt was partial).
        await _persist_manifest(
            db,
            analysis,
            manifest=manifest,
            framework=framework,
            selection_mode=selection_mode,
        )

        # Persist evidence rows with bounded text + embedding.
        await _persist_evidence(db, analysis, snippets, embedding_vectors)

        await _set_status(
            db,
            analysis,
            AnalysisStatus.completed,
            step="completed",
            progress=100,
            summary={
                "framework": framework,
                "selection_mode": selection_mode,
                "selected_files": manifest["selected_count"],
                "evidence_rows": len(snippets),
                "evidence_rows_total": total_snippets,
                "evidence_rows_capped": total_snippets > len(snippets),
            },
            finished=True,
        )

        # Step 3 (M2) — chain into matching_pipeline so requirement↔evidence
        # comparison happens automatically. The job is enqueued only when there
        # are requirement documents to keep the queue quiet for ZIP-only uploads.
        # NOTE: explanation_pipeline is NOT enqueued here — matching_pipeline
        # chains it after matches are persisted. Enqueueing both in parallel
        # raced: explanation ran before matching wrote any match row and
        # silently skipped with reviewed=0.
        if analysis.requirement_document_ids:
            try:
                await create_job("matching_pipeline", {"analysis_job_id": analysis.id})
            except Exception as exc:  # noqa: BLE001
                logger.warning("Cannot enqueue matching_pipeline for %s: %s", analysis.id, exc)
    finally:
        # We disabled the extractor's auto-cleanup so the indexer could read
        # files from disk. Remove the extraction root now that we're done with
        # the on-disk copies; evidence text has already been loaded into memory.
        try:
            shutil.rmtree(extraction.root_dir, ignore_errors=True)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Cannot remove extraction dir %s: %s", extraction.root_dir, exc)

    return {
        "analysis_job_id": analysis.id,
        "status": "completed",
        "framework": framework,
        "selection_mode": selection_mode,
        "evidence_rows": len(snippets),
        "redis_job_id": redis_job_id,
    }


async def _persist_manifest(
    db: AsyncSession,
    analysis: AnalysisJob,
    *,
    manifest: dict,
    framework: str,
    selection_mode: str,
) -> None:
    existing = (await db.execute(
        select(ProjectManifest).where(ProjectManifest.analysis_job_id == analysis.id)
    )).scalar_one_or_none()
    if existing is None:
        db.add(ProjectManifest(
            analysis_job_id=analysis.id,
            workspace_id=analysis.workspace_id,
            framework=framework,
            selection_mode=selection_mode,
            file_count=manifest["file_count"],
            selected_count=manifest["selected_count"],
            skipped_count=manifest["skipped_count"],
            total_size=manifest["total_size"],
            manifest_json=manifest,
            warnings_json=manifest.get("warnings", []),
            analyzer_version=analysis.analyzer_version,
        ))
    else:
        existing.framework = framework
        existing.selection_mode = selection_mode
        existing.file_count = manifest["file_count"]
        existing.selected_count = manifest["selected_count"]
        existing.skipped_count = manifest["skipped_count"]
        existing.total_size = manifest["total_size"]
        existing.manifest_json = manifest
        existing.warnings_json = manifest.get("warnings", [])
        existing.analyzer_version = analysis.analyzer_version
    await db.commit()


async def _persist_evidence(
    db: AsyncSession,
    analysis: AnalysisJob,
    snippets: list[EvidenceSnippet],
    vectors: list[list[float] | None],
) -> None:
    if not snippets:
        return
    # Replace existing evidence rows to keep idempotent.
    existing = (await db.execute(
        select(ProjectEvidence).where(ProjectEvidence.analysis_job_id == analysis.id)
    )).scalars().all()
    for row in existing:
        await db.delete(row)
    await db.flush()

    rows: list[ProjectEvidence] = []
    seen_keys: set[tuple[str, str, str]] = set()
    for idx, snippet in enumerate(snippets):
        key = (snippet.path, snippet.symbol_name, snippet.symbol_kind)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        vector = vectors[idx] if idx < len(vectors) else None
        rows.append(ProjectEvidence(
            analysis_job_id=analysis.id,
            workspace_id=analysis.workspace_id,
            document_id=analysis.zip_document_id,
            source_type="zip",
            source_scope="workspace+analysis_job",
            path=snippet.path,
            language=snippet.language,
            symbol_name=snippet.symbol_name,
            symbol_kind=snippet.symbol_kind,
            line_start=snippet.line_start,
            line_end=snippet.line_end,
            routes_json=snippet.routes,
            calls_json=snippet.calls,
            keywords_json=snippet.keywords,
            snippet=snippet.snippet,
            snippet_sha256=snippet.snippet_sha256,
            embedding=vector,
            embedding_model=EMBEDDING_MODEL if vector else None,
            analyzer_version=analysis.analyzer_version,
        ))
    db.add_all(rows)
    await db.commit()


async def _load_analysis(db: AsyncSession, job_id: int) -> AnalysisJob | None:
    result = await db.execute(select(AnalysisJob).where(AnalysisJob.id == job_id))
    return result.scalar_one_or_none()


async def _load_document(db: AsyncSession, document_id: int) -> Document | None:
    result = await db.execute(select(Document).where(Document.id == document_id))
    return result.scalar_one_or_none()


async def _set_status(
    db: AsyncSession,
    analysis: AnalysisJob,
    status: AnalysisStatus,
    *,
    step: str | None = None,
    progress: int | None = None,
    error: str | None = None,
    summary: dict | None = None,
    finished: bool = False,
) -> None:
    analysis.status = status
    if step is not None:
        analysis.current_step = step
    if progress is not None:
        analysis.progress = progress
    if error is not None:
        analysis.error = error
    if summary is not None:
        analysis.summary = summary
    if status == AnalysisStatus.extracting and analysis.started_at is None:
        analysis.started_at = datetime.utcnow()
    if finished:
        analysis.finished_at = datetime.utcnow()
    await db.commit()