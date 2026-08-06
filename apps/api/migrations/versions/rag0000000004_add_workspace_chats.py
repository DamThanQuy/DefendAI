"""add workspace_chats table for R7 chat theo đề tài

Revision ID: rag0000000004
Revises: rag0000000003
Create Date: 2026-08-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'rag0000000004'
down_revision: Union[str, None] = 'rag0000000003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'workspace_chats',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=False),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('answer', sa.Text(), nullable=True),
        sa.Column('citations', sa.JSON(), nullable=True),
        sa.Column('persona', sa.String(50), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_workspace_chats_id', 'workspace_chats', ['id'], unique=False)
    op.create_index('ix_workspace_chats_workspace_id', 'workspace_chats', ['workspace_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_workspace_chats_workspace_id', table_name='workspace_chats')
    op.drop_index('ix_workspace_chats_id', table_name='workspace_chats')
    op.drop_table('workspace_chats')
