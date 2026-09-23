"""EvidenceMatcher — hybrid retrieval + heuristic scoring (Step 3 M2).

Input contract:

- ``analysis_job_id`` (required) — restricts evidence to a single ZIP job.
- ``requirements`` — list of ``RequirementItem`` extracted by ``requirement_extractor``.

For each requirement the matcher combines four deterministic scores, none of
which require an LLM:

1. **Path / filename** (weight 0.10) — does the requirement keyword appear in
   the evidence path or symbol name?
2. **Symbol / route** (weight 0.35) — does the requirement keyword appear in
   ``symbol_name`` or ``routes_json`` or ``calls_json``?
3. **Business keyword overlap** (weight 0.25) — Jaccard-style overlap of
   ``requirement.keywords`` with ``evidence.keywords_json``.
4. **UI / component snippet** (weight 0.20) — substring match on
   ``evidence.snippet`` for HTML/Vue/JSX templates.
5. **Model / config** (weight 0.10) — path contains ``models`` / ``schemas``
   / ``config`` and matches a requirement keyword.

The vector score (cosine similarity of requirement embedding vs evidence
embedding) is folded into the business overlap term as a small bonus so the
final score still favours literal matches.

The matcher persists ``RequirementMatch`` rows directly via the supplied
``AsyncSession`` so callers don't need a separate write step.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Iterable, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import (
    MatchStatus,
    ProjectEvidence,
    RequirementMatch,
)
from app.services.requirement_extractor import RequirementItem

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Score weights from plan M2
# ---------------------------------------------------------------------------
WEIGHT_PATH = 0.10
WEIGHT_SYMBOL = 0.35
WEIGHT_BUSINESS = 0.25
WEIGHT_UI = 0.20
WEIGHT_MODEL = 0.10

# Status thresholds (sum of weighted score, range 0.00-1.00)
THRESHOLD_MATCHED = 0.70
THRESHOLD_PARTIAL = 0.40
THRESHOLD_INSUFFICIENT = 0.10


@dataclass(slots=True)
class EvidenceCandidate:
    """Lightweight view of one ``ProjectEvidence`` row used for scoring."""

    id: int
    path: str
    language: str | None
    symbol_name: str
    symbol_kind: str
    routes: list[str] = field(default_factory=list)
    calls: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    snippet: str = ""


@dataclass(slots=True)
class ScoredCandidate:
    """Score breakdown for one requirement ↔ evidence pairing."""

    candidate: EvidenceCandidate
    path_score: float = 0.0
    symbol_score: float = 0.0
    business_score: float = 0.0
    ui_score: float = 0.0
    model_score: float = 0.0
    vector_bonus: float = 0.0
    total: float = 0.0

    @property
    def citation(self) -> dict:
        return {
            "evidence_id": self.candidate.id,
            "path": self.candidate.path,
            "symbol_name": self.candidate.symbol_name,
            "symbol_kind": self.candidate.symbol_kind,
            "language": self.candidate.language,
            "routes": list(self.candidate.routes),
            "score": round(self.total, 3),
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
_UI_LANGUAGES = {"html", "jinja2", "handlebars", "ejs", "razor", "cshtml", "blade", "vue", "svelte"}
_MODEL_PATH_HINTS = ("models", "schemas", "config", "configs", "migrations", "alembic")


def _expand_keywords(item: RequirementItem) -> list[str]:
    """Combine title + text + keywords (de-duplicated, lowercased)."""
    seen: list[str] = []
    seen_set: set[str] = set()
    sources = item.keywords + [item.title, item.text]
    for raw in sources:
        if not raw:
            continue
        for token in re.findall(r"[A-Za-zÀ-ỹ_][A-Za-z0-9_À-ỹ]{2,}", raw):
            low = token.lower()
            if low in seen_set:
                continue
            seen_set.add(low)
            seen.append(low)
    return seen


def _normalise(value: str) -> str:
    return value.lower()


def _any_contains(haystacks: Iterable[str], needles: Iterable[str]) -> bool:
    for hay in haystacks:
        low = _normalise(hay)
        for needle in needles:
            if needle and needle in low:
                return True
    return False


def _keyword_overlap(req_keywords: Sequence[str], ev_keywords: Sequence[str]) -> float:
    """Jaccard-ish score in [0, 1]."""
    if not req_keywords or not ev_keywords:
        return 0.0
    req_set = {_normalise(k) for k in req_keywords if k}
    ev_set = {_normalise(k) for k in ev_keywords if k}
    if not req_set or not ev_set:
        return 0.0
    intersection = req_set & ev_set
    union = req_set | ev_set
    return len(intersection) / len(union) if union else 0.0


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------
def score_evidence(
    requirement: RequirementItem,
    evidence: EvidenceCandidate,
    *,
    vector_similarity: float | None = None,
) -> ScoredCandidate:
    """Compute deterministic + vector bonus score for a single pairing."""
    keywords = _expand_keywords(requirement)
    if not keywords:
        keywords = list(requirement.keywords)

    scored = ScoredCandidate(candidate=evidence)

    # Tầng 1: Path / filename (0.10) — keyword có trong path hoặc symbol?
    haystacks = (evidence.path, evidence.symbol_name)
    if _any_contains(haystacks, keywords):
        scored.path_score = WEIGHT_PATH

    # Tầng 2: Symbol / route / calls (0.35) — exact match
    symbol_haystacks = (
        evidence.symbol_name,
        *evidence.routes,
        *evidence.calls,
    )
    if _any_contains(symbol_haystacks, keywords):
        scored.symbol_score = WEIGHT_SYMBOL

    # Tầng 3: Business keyword overlap (0.25)
    overlap = _keyword_overlap(keywords, evidence.keywords)
    if overlap > 0:
        scored.business_score = round(WEIGHT_BUSINESS * min(1.0, overlap * 3.0), 4)

    # Tầng 4: UI/component snippet match (0.20)
    if evidence.language in _UI_LANGUAGES and evidence.snippet:
        if _any_contains([evidence.snippet], keywords):
            scored.ui_score = WEIGHT_UI

    # Tầng 5: Model / config (0.10)
    low_path = _normalise(evidence.path)
    if any(hint in low_path for hint in _MODEL_PATH_HINTS):
        if _any_contains([evidence.symbol_name], keywords):
            scored.model_score = WEIGHT_MODEL

    # Vector bonus — small extra on top of business score to reward semantic
    # matches. Capped so it cannot replace literal hits entirely.
    if vector_similarity is not None and vector_similarity > 0:
        scored.vector_bonus = min(0.15, max(0.0, vector_similarity - 0.5) * 0.3)

    scored.total = min(
        1.0,
        scored.path_score
        + scored.symbol_score
        + scored.business_score
        + scored.ui_score
        + scored.model_score
        + scored.vector_bonus,
    )
    return scored


# ---------------------------------------------------------------------------
# Database access
# ---------------------------------------------------------------------------
async def load_evidence_for_job(
    db: AsyncSession,
    analysis_job_id: int,
    workspace_id: int,
) -> list[EvidenceCandidate]:
    """Load all evidence rows belonging to a single analysis job."""
    result = await db.execute(
        select(ProjectEvidence).where(
            ProjectEvidence.analysis_job_id == analysis_job_id,
            ProjectEvidence.workspace_id == workspace_id,
        )
    )
    candidates: list[EvidenceCandidate] = []
    for row in result.scalars().all():
        candidates.append(
            EvidenceCandidate(
                id=row.id,
                path=row.path,
                language=row.language,
                symbol_name=row.symbol_name,
                symbol_kind=row.symbol_kind,
                routes=list(row.routes_json or []),
                calls=list(row.calls_json or []),
                keywords=list(row.keywords_json or []),
                snippet=row.snippet or "",
            )
        )
    return candidates


# ---------------------------------------------------------------------------
# Match decisions
# ---------------------------------------------------------------------------
def decide_status(score: float, evidence_count: int) -> MatchStatus:
    """Translate the heuristic score into a ``MatchStatus`` enum."""
    if score >= THRESHOLD_MATCHED and evidence_count >= 2:
        return MatchStatus.matched
    if score >= THRESHOLD_PARTIAL:
        return MatchStatus.partial
    if score >= THRESHOLD_INSUFFICIENT:
        return MatchStatus.insufficient_evidence
    return MatchStatus.not_found


def pick_top_evidence(
    scored: list[ScoredCandidate],
    *,
    top_k: int = 3,
) -> list[ScoredCandidate]:
    """Return the top ``top_k`` candidates sorted by descending total."""
    sorted_scored = sorted(scored, key=lambda item: item.total, reverse=True)
    return sorted_scored[:top_k]


def derive_missing_evidence(
    requirement: RequirementItem,
    top_evidence: list[ScoredCandidate],
) -> list[str]:
    """Heuristically list what aspect of the requirement is still uncovered.

    Used for the ``missing_evidence_json`` field so the UI can show concrete
    suggestions. Pure rule-based — no LLM.
    """
    keywords = set(_expand_keywords(requirement))
    seen_keywords: set[str] = set()
    for candidate in top_evidence:
        for kw in candidate.candidate.keywords:
            low = kw.lower()
            if low in keywords:
                seen_keywords.add(low)
        for kw in candidate.candidate.symbol_name.lower().split("_"):
            if kw in keywords:
                seen_keywords.add(kw)
    missing = sorted(keywords - seen_keywords)
    # Filter very short tokens to keep the message readable
    return [kw for kw in missing if len(kw) >= 3][:5]


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------
async def persist_match(
    db: AsyncSession,
    *,
    analysis_job_id: int,
    workspace_id: int,
    requirement: RequirementItem,
    scored: list[ScoredCandidate],
    analyzer_version: str,
) -> RequirementMatch:
    """Replace any existing ``RequirementMatch`` for this pair."""
    top = pick_top_evidence(scored)
    evidence_count = len([s for s in scored if s.total >= THRESHOLD_INSUFFICIENT])
    top_score = top[0].total if top else 0.0
    status = decide_status(top_score, evidence_count)

    existing = (await db.execute(
        select(RequirementMatch).where(
            RequirementMatch.analysis_job_id == analysis_job_id,
            RequirementMatch.requirement_code == requirement.code,
        )
    )).scalar_one_or_none()

    evidence_json = [s.citation for s in top]
    missing_json = derive_missing_evidence(requirement, top)
    confidence = int(round(top_score * 100))

    if existing is None:
        existing = RequirementMatch(
            analysis_job_id=analysis_job_id,
            workspace_id=workspace_id,
            requirement_code=requirement.code,
            requirement_title=requirement.title,
            status=status,
            confidence=confidence,
            reason=None,
            evidence_json=evidence_json,
            missing_evidence_json=missing_json,
            analyzer_version=analyzer_version,
        )
        db.add(existing)
    else:
        existing.requirement_title = requirement.title
        existing.status = status
        existing.confidence = confidence
        existing.evidence_json = evidence_json
        existing.missing_evidence_json = missing_json
        existing.analyzer_version = analyzer_version
    await db.flush()
    return existing