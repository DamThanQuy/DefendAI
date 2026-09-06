"""add soft delete columns to documents

Revision ID: sd0000000001
Revises: hash0000000001
Create Date: 2026-09-03

Thêm cột deleted_at, deleted_by cho soft delete (xoá mềm) tài liệu,
mô phỏng thùng rác Google Drive: row được giữ 30 ngày rồi cron purge.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'sd0000000001'
down_revision: Union[str, None] = 'hash0000000001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'documents',
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )
    op.add_column(
        'documents',
        sa.Column('deleted_by', sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        'fk_documents_deleted_by_users',
        'documents',
        'users',
        ['deleted_by'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index(
        'ix_documents_deleted_at',
        'documents',
        ['deleted_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_documents_deleted_at', table_name='documents')
    op.drop_constraint('fk_documents_deleted_by_users', 'documents', type_='foreignkey')
    op.drop_column('documents', 'deleted_by')
    op.drop_column('documents', 'deleted_at')