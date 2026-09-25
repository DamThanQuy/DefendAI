"""add mock_chat_messages — lưu lịch sử chat Mock Room AI theo user

Revision ID: mockhist000000001
Revises: prof000000001
Create Date: 2026-09-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'mockhist000000001'
down_revision: Union[str, None] = 'prof000000001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'mock_chat_messages',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(length=16), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('time_label', sa.String(length=16), nullable=True),
        sa.Column('document_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_mock_chat_messages_id', 'mock_chat_messages', ['id'])
    op.create_index('ix_mock_chat_messages_user_id', 'mock_chat_messages', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_mock_chat_messages_user_id', table_name='mock_chat_messages')
    op.drop_index('ix_mock_chat_messages_id', table_name='mock_chat_messages')
    op.drop_table('mock_chat_messages')
