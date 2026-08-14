"""add rubrics table (structured rubric = thước đo cho AI)

Revision ID: rub0000000001
Revises: rag0000000009
Create Date: 2026-08-13

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'rub0000000001'
down_revision: Union[str, None] = 'rag0000000009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'rubrics',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('key', sa.String(length=40), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('scope', sa.String(length=20), nullable=False),
        sa.Column('version', sa.String(length=20), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('config', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_rubrics_key', 'rubrics', ['key'], unique=True)
    op.create_index('ix_rubrics_scope', 'rubrics', ['scope'], unique=False)
    op.create_index('ix_rubrics_scope_active', 'rubrics', ['scope', 'is_active'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_rubrics_scope_active', table_name='rubrics')
    op.drop_index('ix_rubrics_scope', table_name='rubrics')
    op.drop_index('ix_rubrics_key', table_name='rubrics')
    op.drop_table('rubrics')
