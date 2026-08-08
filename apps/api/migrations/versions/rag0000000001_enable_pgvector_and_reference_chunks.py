"""enable pgvector + upgrade document_chunks + add reference_chunks

Revision ID: rag0000000001
Revises: f7a1b2c3d4e5
Create Date: 2026-08-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'rag0000000001'
down_revision: Union[str, None] = 'f7a1b2c3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Bật extension pgvector (Postgres có sẵn, không cần service mới)
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # 2. Upgrade bảng cũ document_chunks: embedding Text -> vector(384), meta Text -> JSONB
    op.execute("ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(384) USING embedding::vector")
    op.execute("ALTER TABLE document_chunks ALTER COLUMN meta TYPE JSONB USING meta::jsonb")

    # 3. Bảng mới reference_chunks (kiến thức chuẩn — admin upload, dùng chung)
    op.create_table(
        'reference_chunks',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('category', sa.String(20), nullable=True),
        sa.Column('title', sa.String(255), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('embedding', Vector(384), nullable=True),
        sa.Column('meta', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_reference_chunks_id', 'reference_chunks', ['id'], unique=False)
    op.create_index('ix_reference_chunks_category', 'reference_chunks', ['category'], unique=False)

    # 4. Index vector hnsw (dữ liệu nhỏ — nhanh hơn ivfflat)
    op.execute("CREATE INDEX idx_doc_chunks_embedding ON document_chunks USING hnsw (embedding vector_cosine_ops)")
    op.execute("CREATE INDEX idx_ref_chunks_embedding ON reference_chunks USING hnsw (embedding vector_cosine_ops)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_ref_chunks_embedding")
    op.execute("DROP INDEX IF EXISTS idx_doc_chunks_embedding")
    op.drop_index('ix_reference_chunks_category', table_name='reference_chunks')
    op.drop_index('ix_reference_chunks_id', table_name='reference_chunks')
    op.drop_table('reference_chunks')
    op.execute("ALTER TABLE document_chunks ALTER COLUMN meta TYPE TEXT USING meta::text")
    op.execute("ALTER TABLE document_chunks ALTER COLUMN embedding TYPE TEXT USING embedding::text")