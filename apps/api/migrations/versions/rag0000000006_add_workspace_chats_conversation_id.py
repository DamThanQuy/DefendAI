"""add conversation_id to workspace_chats (multi-conversation chat)

Revision ID: rag0000000006
Revises: rag0000000005
Create Date: 2026-08-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'rag0000000006'
down_revision: Union[str, None] = 'rag0000000005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('workspace_chats', sa.Column('conversation_id', sa.String(50), nullable=True))
    op.create_index('ix_workspace_chats_conversation_id', 'workspace_chats', ['conversation_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_workspace_chats_conversation_id', table_name='workspace_chats')
    op.drop_column('workspace_chats', 'conversation_id')