"""Persistence models for ZIP / BR consistency analysis.

Step 2 introduces three coordinated tables that scope analysis results to a
single workspace + analysis job:

- ``analysis_jobs``        — job lifecycle (queued → completed / rejected / failed)
- ``project_manifests``    — framework-aware file inventory for one job
- ``project_evidence``     — function/class/route evidence with embeddings

All tables share ``workspace_id`` and ``analysis_job_id`` so Step 3 and Step 4
can retrieve by scope without leaking across workspaces. The ``source_type``
and ``source_scope`` columns document what the row represents (``zip``,
``requirement`` or ``reference``) so retriever/RAG never mixes sources.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector

from app.core.database import Base
from app.services.embedder import EMBEDDING_DIM


class AnalysisStatus(str, Enum):
    """Lifecycle of a single analysis job.

    The states are deliberately small:

    - ``queued``      — request accepted, waiting for worker
    - ``extracting``  — worker is downloading/validating/extracting the ZIP
    - ``indexing``    — manifest + evidence index being written
    - ``matching``    — Step 3 heuristic + Step 4 LLM review
    - ``completed``   — match results persisted, temp directory cleaned
    - ``partial``     — some matches persisted but worker could not finish
    - ``rejected``    — archive failed validation/safety checks (no extraction)
    - ``failed``      — unexpected exception during the pipeline
    - ``timeout``     — extraction or pipeline exceeded the timeout budget
    """

    queued = "queued"
    extracting = "extracting"
    indexing = "indexing"
    matching = "matching"
    completed = "completed"
    partial = "partial"
    rejected = "rejected"
    failed = "failed"
    timeout = "timeout"


class AnalysisJob(Base):
    """One analysis run against a workspace ZIP and a list of BR documents.

    The ``input_hash`` is the SHA256 of ``zip_sha256 + requirements_sha256 +
    analyzer_version`` and is used for idempotency: reruns with identical
    input reuse the previous result instead of re-running the heavy pipeline.
    """

    __tablename__ = "analysis_jobs"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(
        Integer, ForeignKey("workspaces.id"), nullable=False, index=True
    )
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    zip_document_id = Column(
        Integer, ForeignKey("documents.id"), nullable=False, index=True
    )
    requirement_document_ids = Column(JSONB, nullable=False, default=list)
    # SHA256 hex of the ZIP object (MinIO) — used together with requirements
    # hash + analyzer version to deduplicate reruns.
    zip_sha256 = Column(String(64), nullable=False)
    requirements_sha256 = Column(String(64), nullable=False)
    analyzer_version = Column(String(32), nullable=False, default="step2-v1")
    # Idempotency key derived from the three values above.
    input_hash = Column(String(64), nullable=False, index=True)

    status = Column(
        SQLEnum(AnalysisStatus),
        default=AnalysisStatus.queued,
        nullable=False,
        index=True,
    )
    progress = Column(Integer, default=0, nullable=False)
    current_step = Column(String(32), nullable=True)
    error = Column(Text, nullable=True)
    # Worker Redis job_id (different from analysis_jobs.id) so frontend can
    # poll /api/jobs/{job_id} if it wants stream-level progress.
    worker_job_id = Column(String(64), nullable=True, index=True)
    # JSON blob with the latest job metadata (counts, framework, warnings…).
    summary = Column(JSONB, nullable=True)

    created_at = Column(
        DateTime, default=datetime.utcnow, nullable=False, index=True
    )
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    workspace = relationship("Workspace", back_populates="analysis_jobs")
    user = relationship("User", foreign_keys=[user_id])
    zip_document = relationship("Document", foreign_keys=[zip_document_id])
    manifest = relationship(
        "ProjectManifest",
        back_populates="analysis_job",
        cascade="all, delete-orphan",
        uselist=False,
    )
    evidence_rows = relationship(
        "ProjectEvidence",
        back_populates="analysis_job",
        cascade="all, delete-orphan",
    )
    matches = relationship(
        "RequirementMatch",
        back_populates="analysis_job",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        # A workspace can only have one queued/running job against the same
        # ZIP at a time. Completed jobs are not blocked.
        Index("ix_analysis_workspace_status", "workspace_id", "status"),
    )


class ProjectManifest(Base):
    """Framework-aware file inventory persisted after extraction.

    One row per analysis job. Stores counts and the full manifest JSON so
    downstream steps can render evidence citations without re-extracting the
    archive. Source scope is fixed to ``workspace + analysis_job``.
    """

    __tablename__ = "project_manifests"

    id = Column(Integer, primary_key=True, index=True)
    analysis_job_id = Column(
        Integer,
        ForeignKey("analysis_jobs.id"),
        nullable=False,
        unique=True,
        index=True,
    )
    workspace_id = Column(
        Integer, ForeignKey("workspaces.id"), nullable=False, index=True
    )
    source_type = Column(String(16), nullable=False, default="zip")
    source_scope = Column(String(32), nullable=False, default="workspace+analysis_job")
    framework = Column(String(32), nullable=False, default="generic")
    selection_mode = Column(String(32), nullable=False, default="generic_fallback")
    file_count = Column(Integer, default=0, nullable=False)
    selected_count = Column(Integer, default=0, nullable=False)
    skipped_count = Column(Integer, default=0, nullable=False)
    total_size = Column(BigInteger, default=0, nullable=False)
    manifest_json = Column(JSONB, nullable=False)
    warnings_json = Column(JSONB, nullable=True)
    analyzer_version = Column(String(32), nullable=False, default="step2-v1")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    analysis_job = relationship("AnalysisJob", back_populates="manifest")


class ProjectEvidence(Base):
    """Function/class/route evidence with vector embedding for RAG retrieval.

    Each row corresponds to one symbol (function, class, route, decorator) that
    the deterministic parser extracted from the selected files. Content is the
    bounded snippet sent to the embedder; the full source is *not* stored here.
    """

    __tablename__ = "project_evidence"

    id = Column(BigInteger, primary_key=True, autoincrement=True, index=True)
    analysis_job_id = Column(
        Integer, ForeignKey("analysis_jobs.id"), nullable=False, index=True
    )
    workspace_id = Column(
        Integer, ForeignKey("workspaces.id"), nullable=False, index=True
    )
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    source_type = Column(String(16), nullable=False, default="zip")
    source_scope = Column(String(32), nullable=False, default="workspace+analysis_job")
    # Path inside the ZIP, e.g. ``apps/api/app/routers/documents.py``.
    path = Column(String(512), nullable=False)
    language = Column(String(32), nullable=True)
    symbol_name = Column(String(255), nullable=False, index=True)
    symbol_kind = Column(String(32), nullable=False)  # function / class / route / decorator
    line_start = Column(Integer, nullable=True)
    line_end = Column(Integer, nullable=True)
    routes_json = Column(JSONB, nullable=True)
    calls_json = Column(JSONB, nullable=True)
    keywords_json = Column(JSONB, nullable=True)
    snippet = Column(Text, nullable=False)
    snippet_sha256 = Column(String(64), nullable=False, index=True)
    embedding = Column(Vector(EMBEDDING_DIM), nullable=True)
    embedding_model = Column(String(64), nullable=True)
    analyzer_version = Column(String(32), nullable=False, default="step2-v1")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    analysis_job = relationship("AnalysisJob", back_populates="evidence_rows")

    __table_args__ = (
        UniqueConstraint(
            "analysis_job_id", "path", "symbol_name", "symbol_kind",
            name="uq_evidence_symbol_per_job",
        ),
        Index("ix_evidence_workspace_job", "workspace_id", "analysis_job_id"),
    )


class MatchStatus(str, Enum):
    """Result of one requirement ↔ evidence match (Step 3)."""

    matched = "matched"
    partial = "partial"
    not_found = "not_found"
    insufficient_evidence = "insufficient_evidence"


class RequirementMatch(Base):
    """Persisted outcome for one requirement against the project evidence.

    ``evidence_json`` is a bounded list of citation paths + line ranges so the
    UI can render the result without re-running the matcher.
    """

    __tablename__ = "requirement_matches"

    id = Column(Integer, primary_key=True, index=True)
    analysis_job_id = Column(
        Integer, ForeignKey("analysis_jobs.id"), nullable=False, index=True
    )
    workspace_id = Column(
        Integer, ForeignKey("workspaces.id"), nullable=False, index=True
    )
    requirement_code = Column(String(64), nullable=False, index=True)
    requirement_title = Column(String(255), nullable=True)
    status = Column(
        SQLEnum(MatchStatus),
        default=MatchStatus.insufficient_evidence,
        nullable=False,
    )
    confidence = Column(Integer, default=0, nullable=False)
    reason = Column(Text, nullable=True)
    evidence_json = Column(JSONB, nullable=True)
    missing_evidence_json = Column(JSONB, nullable=True)
    # Step 4 — AIGateway provider/model that produced ``reason`` (NULL when
    # only heuristic was applied). Allows the UI to display "AI-reviewed" or
    # "heuristic-only" badges and lets ops audit which provider ran the
    # explanation.
    reason_provider = Column(String(64), nullable=True)
    reason_model = Column(String(64), nullable=True)
    reason_latency_ms = Column(Integer, nullable=True)
    reason_fallback = Column(
        # True when Step 4 attempted the AI but fell back to heuristic
        # (provider down, timeout, invalid JSON). NULL before Step 4 ran.
        String(16),
        nullable=True,
    )
    analyzer_version = Column(String(32), nullable=False, default="step2-v1")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    analysis_job = relationship("AnalysisJob", back_populates="matches")

    __table_args__ = (
        UniqueConstraint(
            "analysis_job_id", "requirement_code",
            name="uq_match_per_job_per_requirement",
        ),
    )