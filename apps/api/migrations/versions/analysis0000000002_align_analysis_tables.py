"""Step 5b — align analysis tables with ORM models

Revision ID: analysis0000000002
Revises: analysis0000000001
Create Date: 2026-09-06

Adds missing columns that the ORM models expect but the initial Step 5
migration did not create:
- project_manifests: workspace_id, source_type, source_scope, counts, total_size, analyzer_version
- project_evidence: workspace_id, document_id, source_type, source_scope, snippet_sha256,
  embedding_model, analyzer_version, unique constraint per symbol
- requirement_matches: workspace_id, evidence_json/missing_evidence_json (renamed),
  reason_latency_ms, reason_fallback, analyzer_version, unique constraint per requirement
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "analysis0000000002"
down_revision: Union[str, None] = "analysis0000000001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

JSON = sa.JSON


def _column_exists(table: str, column: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    )
    return result.scalar() is not None


def _constraint_exists(table: str, name: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.table_constraints "
            "WHERE table_name = :t AND constraint_name = :n"
        ),
        {"t": table, "n": name},
    )
    return result.scalar() is not None


def _index_exists(table: str, name: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT 1 FROM pg_indexes WHERE tablename = :t AND indexname = :n"
        ),
        {"t": table, "n": name},
    )
    return result.scalar() is not None


def upgrade() -> None:
    # ---- project_manifests: add missing columns ----
    for col in [
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id"), nullable=True),
        sa.Column("source_type", sa.String(16), nullable=False, server_default="zip"),
        sa.Column("source_scope", sa.String(32), nullable=False, server_default="workspace+analysis_job"),
        sa.Column("file_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("selected_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_size", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("analyzer_version", sa.String(32), nullable=False, server_default="step2-v1"),
    ]:
        if not _column_exists("project_manifests", col.name):
            op.add_column("project_manifests", col)
    if not _index_exists("project_manifests", "ix_project_manifests_workspace_id"):
        op.create_index("ix_project_manifests_workspace_id", "project_manifests", ["workspace_id"])

    # ---- project_evidence: add missing columns ----
    for col in [
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id"), nullable=True),
        sa.Column("document_id", sa.Integer(), sa.ForeignKey("documents.id"), nullable=True),
        sa.Column("source_type", sa.String(16), nullable=False, server_default="zip"),
        sa.Column("source_scope", sa.String(32), nullable=False, server_default="workspace+analysis_job"),
        sa.Column("snippet_sha256", sa.String(64), nullable=True),
        sa.Column("embedding_model", sa.String(64), nullable=True),
        sa.Column("analyzer_version", sa.String(32), nullable=False, server_default="step2-v1"),
    ]:
        if not _column_exists("project_evidence", col.name):
            op.add_column("project_evidence", col)
    for ix_name, ix_cols in [
        ("ix_project_evidence_workspace_id", ["workspace_id"]),
        ("ix_project_evidence_document_id", ["document_id"]),
        ("ix_project_evidence_snippet_sha256", ["snippet_sha256"]),
        ("ix_evidence_workspace_job", ["workspace_id", "analysis_job_id"]),
    ]:
        if not _index_exists("project_evidence", ix_name):
            op.create_index(ix_name, "project_evidence", ix_cols)
    if not _constraint_exists("project_evidence", "uq_evidence_symbol_per_job"):
        op.create_unique_constraint("uq_evidence_symbol_per_job", "project_evidence", ["analysis_job_id", "path", "symbol_name", "symbol_kind"])

    # ---- requirement_matches: add missing columns ----
    for col in [
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id"), nullable=True),
        sa.Column("reason_latency_ms", sa.Integer(), nullable=True),
        sa.Column("analyzer_version", sa.String(32), nullable=False, server_default="step2-v1"),
    ]:
        if not _column_exists("requirement_matches", col.name):
            op.add_column("requirement_matches", col)
    # reason_fallback may already exist as TEXT — widen/check type
    if not _column_exists("requirement_matches", "reason_fallback"):
        op.add_column("requirement_matches", sa.Column("reason_fallback", sa.String(16), nullable=True))
    # evidence / missing_evidence were created as "evidence" and "missing_evidence";
    # ORM expects "evidence_json" and "missing_evidence_json"
    if _column_exists("requirement_matches", "evidence"):
        op.alter_column("requirement_matches", "evidence", new_column_name="evidence_json", existing_type=JSON())
    if _column_exists("requirement_matches", "missing_evidence"):
        op.alter_column("requirement_matches", "missing_evidence", new_column_name="missing_evidence_json", existing_type=JSON())
    if not _index_exists("requirement_matches", "ix_requirement_matches_workspace_id"):
        op.create_index("ix_requirement_matches_workspace_id", "requirement_matches", ["workspace_id"])
    if not _constraint_exists("requirement_matches", "uq_match_per_job_per_requirement"):
        op.create_unique_constraint("uq_match_per_job_per_requirement", "requirement_matches", ["analysis_job_id", "requirement_code"])


def downgrade() -> None:
    op.drop_constraint("uq_match_per_job_per_requirement", "requirement_matches", type_="unique")
    op.drop_index("ix_requirement_matches_workspace_id", table_name="requirement_matches")
    op.drop_column("requirement_matches", "analyzer_version")
    op.drop_column("requirement_matches", "reason_fallback")
    op.drop_column("requirement_matches", "reason_latency_ms")
    op.alter_column("requirement_matches", "evidence_json", new_column_name="evidence", existing_type=JSON())
    op.alter_column("requirement_matches", "missing_evidence_json", new_column_name="missing_evidence", existing_type=JSON())
    op.drop_column("requirement_matches", "workspace_id")

    op.drop_constraint("uq_evidence_symbol_per_job", "project_evidence", type_="unique")
    op.drop_index("ix_evidence_workspace_job", table_name="project_evidence")
    op.drop_index("ix_project_evidence_snippet_sha256", table_name="project_evidence")
    op.drop_index("ix_project_evidence_document_id", table_name="project_evidence")
    op.drop_index("ix_project_evidence_workspace_id", table_name="project_evidence")
    op.drop_column("project_evidence", "analyzer_version")
    op.drop_column("project_evidence", "embedding_model")
    op.drop_column("project_evidence", "snippet_sha256")
    op.drop_column("project_evidence", "source_scope")
    op.drop_column("project_evidence", "source_type")
    op.drop_column("project_evidence", "document_id")
    op.drop_column("project_evidence", "workspace_id")

    op.drop_index("ix_project_manifests_workspace_id", table_name="project_manifests")
    op.drop_column("project_manifests", "analyzer_version")
    op.drop_column("project_manifests", "total_size")
    op.drop_column("project_manifests", "skipped_count")
    op.drop_column("project_manifests", "selected_count")
    op.drop_column("project_manifests", "file_count")
    op.drop_column("project_manifests", "source_scope")
    op.drop_column("project_manifests", "source_type")
    op.drop_column("project_manifests", "workspace_id")
