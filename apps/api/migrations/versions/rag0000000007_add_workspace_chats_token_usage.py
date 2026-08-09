"""add token usage columns to workspace_chats (real token gauge)

Revision ID: rag0000000007
Revises: rag0000000006
Create Date: 2026-08-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'rag0000000007'
down_revision: Union[str, None] = 'rag0000000006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('workspace_chats', sa.Column('prompt_tokens', sa.Integer(), nullable=True))
    op.add_column('workspace_chats', sa.Column('completion_tokens', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('workspace_chats', 'completion_tokens')
    op.drop_column('workspace_chats', 'prompt_tokens')