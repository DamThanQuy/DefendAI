"""Step 5c — convert project_evidence.embedding from bytea to pgvector vector(1024)

Revision ID: analysis0000000003
Revises: analysis0000000002
Create Date: 2026-09-06

The original Step 5 migration created ``project_evidence.embedding`` as a
``LargeBinary`` (``bytea``) column. The Python ORM model (and the matching
pipeline) expects the column to be a pgvector ``vector(1024)`` so that pgvector
HNSW indexes can be used for cosine similarity search.

This migration:
- DROPs any existing index on the bytea column.
- DROPs the bytea ``embedding`` column.
- ADDS a new ``embedding`` column of type ``vector(1024)``.
- RECREATES the HNSW cosine-distance index for fast RAG retrieval.

The pgvector extension must already be installed (it is by default in the
defense-db image).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "analysis0000000003"
down_revision: Union[str, None] = "analysis0000000002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMBEDDING_DIM = 1024


def upgrade() -> None:
    conn = op.get_bind()
    is_vector = conn.execute(sa.text(
        "SELECT data_type FROM information_schema.columns "
        "WHERE table_name = 'project_evidence' AND column_name = 'embedding'"
    )).scalar()

    if is_vector == "bytea":
        conn.execute(sa.text(
            "DROP INDEX IF EXISTS ix_project_evidence_embedding_hnsw"
        ))
        op.drop_column("project_evidence", "embedding")

    has_embedding = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = 'project_evidence' AND column_name = 'embedding'"
    )).scalar()
    if not has_embedding:
        op.execute(
            f"ALTER TABLE project_evidence ADD COLUMN embedding vector({EMBEDDING_DIM})"
        )

    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_project_evidence_embedding_hnsw "
        "ON project_evidence USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_project_evidence_embedding_hnsw")
    op.execute("ALTER TABLE project_evidence DROP COLUMN IF EXISTS embedding")
    op.add_column(
        "project_evidence",
        sa.Column("embedding", sa.LargeBinary(), nullable=True),
    )
