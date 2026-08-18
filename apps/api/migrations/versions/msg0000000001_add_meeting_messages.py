"""add meeting_messages table (chat transcript for Mock Room)

Revision ID: msg0000000001
Revises: rub0000000001
Create Date: 2026-08-15

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'msg0000000001'
down_revision: Union[str, None] = 'rub0000000001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'meeting_messages',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('meeting_id', sa.Integer(), nullable=False),
        sa.Column('sender_name', sa.String(length=100), nullable=False),
        sa.Column('sender_role', sa.String(length=50), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_meeting_messages_id', 'meeting_messages', ['id'], unique=False)
    op.create_index('ix_meeting_messages_meeting_id', 'meeting_messages', ['meeting_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_meeting_messages_meeting_id', table_name='meeting_messages')
    op.drop_index('ix_meeting_messages_id', table_name='meeting_messages')
    op.drop_table('meeting_messages')