"""add workspace_questions table for R6 'Hỏi theo đề tài'

Revision ID: rag0000000003
Revises: rag0000000002
Create Date: 2026-08-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'rag0000000003'
down_revision: Union[str, None] = 'rag0000000002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'workspace_questions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=False),
        sa.Column('topic', sa.Text(), nullable=False),
        sa.Column('persona', sa.String(50), nullable=False),
        sa.Column('questions', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_workspace_questions_id', 'workspace_questions', ['id'], unique=False)
    op.create_index('ix_workspace_questions_workspace_id', 'workspace_questions', ['workspace_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_workspace_questions_workspace_id', table_name='workspace_questions')
    op.drop_index('ix_workspace_questions_id', table_name='workspace_questions')
    op.drop_table('workspace_questions')
