"""Step 5 — ZIP/BR consistency analysis tables

Revision ID: analysis0000000001
Revises: sd0000000002
Create Date: 2026-09-06

Adds three coordinated tables for ZIP/BR consistency analysis:
- analysis_jobs        — job lifecycle
- project_manifests   — framework-aware file inventory
- project_evidence    — function/class/route evidence with embeddings
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "analysis0000000001"
down_revision: Union[str, None] = "sd0000000002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Use sa.JSON (PostgreSQL JSONB in SQLAlchemy 2.x uses sa.JSON with JSONB variant)
JSON = sa.JSON


def upgrade() -> None:
    # analysis_jobs
    op.create_table(
        "analysis_jobs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("zip_document_id", sa.Integer(), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column(
            "requirement_document_ids",
            JSON(),
            nullable=False,
            server_default="[]",
        ),
        sa.Column("zip_sha256", sa.String(64), nullable=False),
        sa.Column("requirements_sha256", sa.String(64), nullable=False),
        sa.Column("analyzer_version", sa.String(32), nullable=False, server_default="step4-v1"),
        sa.Column("input_hash", sa.String(64), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "queued", "extracting", "indexing", "matching",
                "completed", "partial", "rejected", "failed", "timeout",
                name="analysisstatus",
            ),
            nullable=False,
            server_default="queued",
        ),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("current_step", sa.String(64), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("worker_job_id", sa.String(128), nullable=True),
        sa.Column("summary", JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
    )
    op.create_index("ix_analysis_jobs_id", "analysis_jobs", ["id"])
    op.create_index("ix_analysis_jobs_workspace_id", "analysis_jobs", ["workspace_id"])
    op.create_index("ix_analysis_jobs_user_id", "analysis_jobs", ["user_id"])
    op.create_index("ix_analysis_jobs_zip_document_id", "analysis_jobs", ["zip_document_id"])
    op.create_index("ix_analysis_jobs_input_hash", "analysis_jobs", ["input_hash"])
    op.create_index("ix_analysis_jobs_status", "analysis_jobs", ["status"])

    # project_manifests
    op.create_table(
        "project_manifests",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("analysis_job_id", sa.Integer(), sa.ForeignKey("analysis_jobs.id"), nullable=False),
        sa.Column("framework", sa.String(64), nullable=True),
        sa.Column("manifest_json", JSON(), nullable=True),
        sa.Column("warnings_json", JSON(), nullable=True),
        sa.Column("selection_mode", sa.String(32), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_project_manifests_id", "project_manifests", ["id"])
    op.create_index("ix_project_manifests_analysis_job_id", "project_manifests", ["analysis_job_id"])

    # project_evidence
    op.create_table(
        "project_evidence",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("analysis_job_id", sa.Integer(), sa.ForeignKey("analysis_jobs.id"), nullable=False),
        sa.Column("path", sa.String(1024), nullable=False),
        sa.Column("language", sa.String(32), nullable=True),
        sa.Column("symbol_name", sa.String(256), nullable=True),
        sa.Column("symbol_kind", sa.String(64), nullable=True),
        sa.Column("line_start", sa.Integer(), nullable=True),
        sa.Column("line_end", sa.Integer(), nullable=True),
        sa.Column("snippet", sa.Text(), nullable=True),
        sa.Column("routes_json", JSON(), nullable=True, server_default="[]"),
        sa.Column("calls_json", JSON(), nullable=True, server_default="[]"),
        sa.Column("keywords_json", JSON(), nullable=True, server_default="[]"),
        sa.Column("embedding", sa.LargeBinary(), nullable=True),  # vector(768) as binary
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_project_evidence_id", "project_evidence", ["id"])
    op.create_index("ix_project_evidence_analysis_job_id", "project_evidence", ["analysis_job_id"])
    op.create_index("ix_project_evidence_path", "project_evidence", ["path"])

    # requirement_matches
    op.create_table(
        "requirement_matches",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("analysis_job_id", sa.Integer(), sa.ForeignKey("analysis_jobs.id"), nullable=False),
        sa.Column("requirement_code", sa.String(64), nullable=False),
        sa.Column("requirement_title", sa.String(512), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "matched", "partial", "not_found", "insufficient_evidence",
                name="matchstatus",
            ),
            nullable=False,
        ),
        sa.Column("confidence", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("evidence", JSON(), nullable=True, server_default="[]"),
        sa.Column("missing_evidence", JSON(), nullable=True, server_default="[]"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("reason_provider", sa.String(64), nullable=True),
        sa.Column("reason_model", sa.String(128), nullable=True),
        sa.Column("reason_fallback", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_requirement_matches_id", "requirement_matches", ["id"])
    op.create_index("ix_requirement_matches_analysis_job_id", "requirement_matches", ["analysis_job_id"])
    op.create_index("ix_requirement_matches_requirement_code", "requirement_matches", ["requirement_code"])


def downgrade() -> None:
    op.drop_table("requirement_matches")
    op.drop_table("project_evidence")
    op.drop_table("project_manifests")
    op.drop_table("analysis_jobs")
