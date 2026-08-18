"""Shared helpers for the code-review map-reduce pipeline (used by code_scan handlers)."""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import CodeAnalysis, CodeAnalysisIssue, CodeAnalysisStatus

logger = logging.getLogger(__name__)

async def _module_issues_to_rows(
    db: AsyncSession, analysis_id: int, module: str, issues: list[dict[str, Any]]
) -> None:
    """Persist one module's normalized issues into code_analysis_issues."""
    for issue in issues:
        db.add(CodeAnalysisIssue(
            analysis_id=analysis_id,
            module=module,
            file=issue["file"],
            line=issue["line"],
            type=issue.get("type", "code_smell"),
            severity=issue["severity"],
            description=issue.get("description", ""),
            suggestion=issue.get("suggestion", ""),
        ))
    await db.commit()


async def _reduce_analysis(db: AsyncSession, analysis_id: int) -> None:
    """Aggregate all issues for an analysis into a summary (no extra LLM call).

    ponytail: current reduce is pure aggregation; upgrade to a single LLM summary over
    per-module summaries when a narrative summary is needed.
    """
    result = await db.execute(
        select(CodeAnalysisIssue).where(CodeAnalysisIssue.analysis_id == analysis_id)
    )
    issues = result.scalars().all()

    stats = {sev: 0 for sev in ("critical", "high", "medium", "low", "info")}
    for issue in issues:
        sev = (issue.severity or "info").lower()
        stats[sev] = stats.get(sev, 0) + 1

    total = len(issues)
    summary = (
        f"Phân tích {total} vấn đề từ {stats.get('critical', 0)} critical, "
        f"{stats.get('high', 0)} high, {stats.get('medium', 0)} medium, "
        f"{stats.get('low', 0)} low, {stats.get('info', 0)} info."
    )

    analysis = (await db.execute(select(CodeAnalysis).where(CodeAnalysis.id == analysis_id))).scalar_one_or_none()
    if analysis is None:
        logger.warning("Reduce skipped: CodeAnalysis %s not found", analysis_id)
        return
    analysis.status = CodeAnalysisStatus.completed
    analysis.summary = summary
    analysis.stats_json = stats
    analysis.done_modules = analysis.total_modules or analysis.done_modules
    await db.commit()