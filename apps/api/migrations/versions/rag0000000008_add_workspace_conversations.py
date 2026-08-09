"""add workspace_conversations table (renameable chat conversations)

Revision ID: rag0000000008
Revises: rag0000000007
Create Date: 2026-08-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'rag0000000008'
down_revision: Union[str, None] = 'rag0000000007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'workspace_conversations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('workspace_id', sa.Integer(), sa.ForeignKey('workspaces.id'), nullable=False, index=True),
        sa.Column('conversation_id', sa.String(50), nullable=False, index=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('workspace_id', 'conversation_id', name='uq_ws_conv'),
    )


def downgrade() -> None:
    op.drop_table('workspace_conversations')