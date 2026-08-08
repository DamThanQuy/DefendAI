"""resize embedding 384 -> 1024 for gemini-embedding-2-preview

Revision ID: rag0000000002
Revises: rag0000000001
Create Date: 2026-08-05

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'rag0000000002'
down_revision: Union[str, None] = 'rag0000000001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_DIM = 1024  # Gemini qua local endpoint, ép xuống qua param `dimensions` — vì pgvector chỉ index <= 2000 dim
OLD_DIM = 384   # all-MiniLM-L6-v2 (R1)


def upgrade() -> None:
    # Đổi backend embedding: drop HNSW index (dim nằm trong opclass) → alter type → recreate.
    op.execute("DROP INDEX IF EXISTS idx_ref_chunks_embedding")
    op.execute("DROP INDEX IF EXISTS idx_doc_chunks_embedding")
    op.execute(
        f"ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector({NEW_DIM}) "
        f"USING embedding::vector({NEW_DIM})"
    )
    op.execute(
        f"ALTER TABLE reference_chunks ALTER COLUMN embedding TYPE vector({NEW_DIM}) "
        f"USING embedding::vector({NEW_DIM})"
    )
    op.execute("CREATE INDEX idx_doc_chunks_embedding ON document_chunks USING hnsw (embedding vector_cosine_ops)")
    op.execute("CREATE INDEX idx_ref_chunks_embedding ON reference_chunks USING hnsw (embedding vector_cosine_ops)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_ref_chunks_embedding")
    op.execute("DROP INDEX IF EXISTS idx_doc_chunks_embedding")
    op.execute(
        f"ALTER TABLE reference_chunks ALTER COLUMN embedding TYPE vector({OLD_DIM}) "
        f"USING embedding::vector({OLD_DIM})"
    )
    op.execute(
        f"ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector({OLD_DIM}) "
        f"USING embedding::vector({OLD_DIM})"
    )
    op.execute("CREATE INDEX idx_doc_chunks_embedding ON document_chunks USING hnsw (embedding vector_cosine_ops)")
    op.execute("CREATE INDEX idx_ref_chunks_embedding ON reference_chunks USING hnsw (embedding vector_cosine_ops)")
