"""make documents.uploaded_by NOT NULL

Revision ID: h1a2b3c4d5e8
Revises: 36832a5f71e4
Create Date: 2026-08-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'h1a2b3c4d5e8'
down_revision: Union[str, None] = '36832a5f71e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Mọi document phải gắn với 1 user (chủ sở hữu).
    # Đảm bảo không còn giá trị NULL trước khi set NOT NULL.
    op.execute("UPDATE documents SET uploaded_by = 1 WHERE uploaded_by IS NULL")
    op.alter_column(
        'documents',
        'uploaded_by',
        existing_type=sa.Integer(),
        nullable=False,
    )

def downgrade() -> None:
    op.alter_column(
        'documents',
        'uploaded_by',
        existing_type=sa.Integer(),
        nullable=True,
    )
