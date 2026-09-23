"""Worker handler for Step 4 (AI explanation) of the ZIP/BR analysis pipeline.

After Step 3 has produced ``RequirementMatch`` rows with a deterministic
``status`` and ``confidence``, this handler:

  1. Loads the ``AnalysisJob`` and all ``RequirementMatch`` rows for it.
  2. Skips matches already reviewed (idempotent: ``reason_provider IS NOT
     NULL`` means a previous run already wrote a result) and skips
     ``not_found`` / ``insufficient_evidence`` rows that have no evidence to
     review.
  3. For each remaining match: pulls the top-3 evidence rows from
     ``evidence_json`` and calls ``evidence_synthesizer.synthesize_match_explanation``.
  4. Persists the AI result back into ``RequirementMatch.reason``,
     ``missing_evidence_json``, ``reason_provider``, ``reason_model``,
     ``reason_latency_ms`` and ``reason_fallback``.

LLM is invoked through ``AIGateway`` — never directly. If the AI is
unavailable or returns invalid JSON the synthesizer returns a safe fallback
and the handler still completes the job (status → completed / partial).
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker
from app.models.entities import (
    AnalysisJob,
    AnalysisStatus,
    MatchStatus,
    RequirementMatch,
)
from app.services.evidence_synthesizer import (
    SynthesizerResult,
    synthesize_match_explanation,
)
from app.services.job_queue import register_handler
from app.services.requirement_extractor import RequirementItem

logger = logging.getLogger(__name__)


# Statuses where there's nothing for the AI to review — skip these to keep
# the queue cheap and avoid meaningless "AI review" output.
_REVIEWABLE_STATUSES = {MatchStatus.matched, MatchStatus.partial}
# Hard cap to keep one job bounded; matches above this still keep their
# heuristic ``reason`` untouched.
MAX_MATCHES_PER_JOB = 50


@register_handler("explanation_pipeline")
async def handle_explanation_pipeline(params: dict[str, Any]) -> dict[str, Any]:
    """Run Step 4 explanation for one analysis job."""
    job_id = params.get("analysis_job_id")
    if not isinstance(job_id, int):
        raise ValueError("analysis_job_id (int) is required for explanation_pipeline")

    async with async_session_maker() as db:
        analysis = await _load_analysis(db, job_id)
        if analysis is None:
            return {"analysis_job_id": job_id, "status": "failed", "error": "Analysis not found"}
        if analysis.status not in {AnalysisStatus.completed, AnalysisStatus.partial}:
            return {
                "analysis_job_id": job_id,
                "status": "skipped",
                "reason": f"Job is in status {analysis.status.value}, explanation requires completed/partial",
            }

        try:
            return await _run_explanation(db, analysis)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Explanation pipeline failed for job %s", job_id)
            await _set_status(
                db, analysis, AnalysisStatus.failed,
                step="explaining", error=f"{type(exc).__name__}: {exc}",
            )
            return {"analysis_job_id": job_id, "status": "failed", "error": str(exc)}


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------
async def _run_explanation(
    db: AsyncSession,
    analysis: AnalysisJob,
) -> dict[str, Any]:
    analysis.status = AnalysisStatus.matching  # reuse "matching" while AI reviews
    analysis.current_step = "explaining"
    analysis.progress = 10
    await db.commit()

    matches = await _load_reviewable_matches(db, analysis.id)
    if not matches:
        await _set_status(
            db,
            analysis,
            AnalysisStatus.completed,
            step="explaining:skipped",
            progress=100,
            summary={
                **(analysis.summary or {}),
                "explanation": {
                    "reviewed": 0,
                    "skipped": 0,
                    "fallback": 0,
                    "errors": 0,
                },
            },
            finished=True,
        )
        return {
            "analysis_job_id": analysis.id,
            "status": "completed",
            "reviewed": 0,
            "skipped": 0,
        }

    reviewed = 0
    fallback = 0
    errors = 0
    skipped_existing = 0
    total = min(len(matches), MAX_MATCHES_PER_JOB)
    for index, match in enumerate(matches[:MAX_MATCHES_PER_JOB], start=1):
        # Reuse heuristic state when Step 4 already wrote a result.
        if match.reason_provider is not None:
            skipped_existing += 1
            continue

        try:
            result = await _review_one(db, analysis, match)
        except Exception as exc:  # noqa: BLE001
            errors += 1
            logger.warning(
                "Explanation failed for match %s (job %s): %s",
                match.id, analysis.id, exc,
            )
            continue

        if result.fallback_used:
            fallback += 1
        reviewed += 1
        # Update progress roughly every match.
        analysis.progress = 10 + int(80 * index / max(total, 1))
        analysis.current_step = f"explaining:{index}/{total}"
        await db.commit()

    analysis.progress = 100
    analysis.current_step = "explaining:completed"
    explanation_summary = {
        "reviewed": reviewed,
        "skipped_existing": skipped_existing,
        "fallback": fallback,
        "errors": errors,
    }
    await _set_status(
        db,
        analysis,
        AnalysisStatus.completed if errors == 0 else AnalysisStatus.partial,
        step="explaining:completed",
        progress=100,
        summary={**(analysis.summary or {}), "explanation": explanation_summary},
        finished=True,
    )

    return {
        "analysis_job_id": analysis.id,
        "status": "completed" if errors == 0 else "partial",
        **explanation_summary,
    }


# ---------------------------------------------------------------------------
# Match review
# ---------------------------------------------------------------------------
async def _review_one(
    db: AsyncSession,
    analysis: AnalysisJob,
    match: RequirementMatch,
) -> SynthesizerResult:
    requirement = _match_to_requirement(match)
    top_evidence = _normalize_evidence(match.evidence_json)
    result = await synthesize_match_explanation(
        requirement,
        top_evidence,
        heuristic_status=match.status.value,
        heuristic_confidence=int(match.confidence or 0),
        heuristic_missing=list(match.missing_evidence_json or []),
    )
    match.reason = result.reason
    match.missing_evidence_json = result.missing_evidence
    match.confidence = result.confidence
    match.reason_provider = result.provider
    match.reason_model = result.model
    match.reason_latency_ms = result.latency_ms
    match.reason_fallback = "true" if result.fallback_used else "false"
    # ``status`` is not re-assigned: Step 3 owns the deterministic decision.
    # If the synthesizer says "matched" and heuristic said "partial", keep
    # the conservative heuristic value so the UI doesn't flip-flop.
    await db.commit()
    return result


def _match_to_requirement(match: RequirementMatch) -> RequirementItem:
    """Build a minimal RequirementItem from a persisted match row.

    The synthesizer only needs ``code``, ``title``, ``text`` and ``keywords``
    for the prompt; ``actors`` and ``citation`` are optional and we leave
    them empty when not stored on the match.
    """
    return RequirementItem(
        code=match.requirement_code,
        title=match.requirement_title or match.requirement_code,
        text=match.requirement_title or "",
        keywords=[],
        actors=[],
        citation={},
    )


def _normalize_evidence(evidence_json: Any) -> list[dict]:
    """Extract the bounded top-3 evidence rows for the prompt.

    Accepts the JSON list persisted by ``evidence_matcher.persist_match``
    (each entry already contains ``path``, ``symbol_name``, ``symbol_kind``,
    ``language`` and ``score``; ``snippet`` is optional but recommended).
    """
    if not evidence_json:
        return []
    if not isinstance(evidence_json, list):
        return []
    out: list[dict] = []
    for entry in evidence_json:
        if not isinstance(entry, dict):
            continue
        out.append(
            {
                "path": entry.get("path", ""),
                "symbol_name": entry.get("symbol_name", ""),
                "symbol_kind": entry.get("symbol_kind", ""),
                "language": entry.get("language", ""),
                "snippet": entry.get("snippet") or "",
            }
        )
        if len(out) >= 3:
            break
    return out


# ---------------------------------------------------------------------------
# Database access
# ---------------------------------------------------------------------------
async def _load_analysis(db: AsyncSession, job_id: int) -> AnalysisJob | None:
    result = await db.execute(select(AnalysisJob).where(AnalysisJob.id == job_id))
    return result.scalar_one_or_none()


async def _load_reviewable_matches(
    db: AsyncSession,
    analysis_job_id: int,
) -> list[RequirementMatch]:
    """Return all matches that may benefit from AI review.

    Includes only the two actionable statuses (``matched`` / ``partial``) so
    the AI does not waste tokens on rows that have no evidence to discuss.
    """
    result = await db.execute(
        select(RequirementMatch).where(
            RequirementMatch.analysis_job_id == analysis_job_id,
            RequirementMatch.status.in_(_REVIEWABLE_STATUSES),
        )
    )
    return list(result.scalars().all())


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
    if finished:
        analysis.finished_at = datetime.utcnow()
    await db.commit()