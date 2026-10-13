"""add mock_chat_sessions + session_id trên mock_chat_messages

Lịch sử chat Mock Room AI chuyển từ 1 blob phảng mỗi user sang nhiều PHIÊN,
gắn theo từng tài liệu để user xem lại / tiếp tục / xoá theo file.

Revision ID: mockhist000000002
Revises: mockhist000000001
Create Date: 2026-10-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'mockhist000000002'
down_revision: Union[str, None] = 'mockhist000000001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'mock_chat_sessions',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('document_id', sa.Integer(), nullable=True),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('message_count', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_mock_chat_sessions_id', 'mock_chat_sessions', ['id'])
    op.create_index('ix_mock_chat_sessions_user_id', 'mock_chat_sessions', ['user_id'])
    op.create_index('ix_mock_chat_sessions_document_id', 'mock_chat_sessions', ['document_id'])

    op.add_column(
        'mock_chat_messages',
        sa.Column('session_id', sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        'fk_mock_chat_messages_session_id',
        'mock_chat_messages',
        'mock_chat_sessions',
        ['session_id'],
        ['id'],
        ondelete='CASCADE',
    )
    op.create_index('ix_mock_chat_messages_session_id', 'mock_chat_messages', ['session_id'])

    # ── Backfill: dữ liệu cũ (1 blob phẳng mỗi user, session_id IS NULL)
    #    → gom thành MỘT phiên legacy per user để user không mất lịch sử. ──
    op.execute(r"""
        INSERT INTO mock_chat_sessions (user_id, document_id, title, message_count, created_at, updated_at)
        SELECT m.user_id,
               (SELECT m2.document_id FROM mock_chat_messages m2
                 WHERE m2.user_id = m.user_id AND m2.document_id IS NOT NULL
                 ORDER BY m2.id DESC LIMIT 1),
               COALESCE(
                   (SELECT left(regexp_replace(m3.content, E'\n', ' ', 'g'), 100)
                      FROM mock_chat_messages m3
                     WHERE m3.user_id = m.user_id AND m3.role = 'user'
                     ORDER BY m3.id ASC LIMIT 1),
                   'Phiên chất vấn'),
               count(*), min(m.created_at), max(m.created_at)
        FROM mock_chat_messages m
        WHERE m.session_id IS NULL
        GROUP BY m.user_id
    """)
    op.execute(r"""
        UPDATE mock_chat_messages mm
        SET session_id = s.id
        FROM mock_chat_sessions s
        WHERE mm.session_id IS NULL AND s.user_id = mm.user_id
    """)


def downgrade() -> None:
    op.drop_index('ix_mock_chat_messages_session_id', table_name='mock_chat_messages')
    op.drop_constraint('fk_mock_chat_messages_session_id', 'mock_chat_messages', type_='foreignkey')
    op.drop_column('mock_chat_messages', 'session_id')

    op.drop_index('ix_mock_chat_sessions_document_id', table_name='mock_chat_sessions')
    op.drop_index('ix_mock_chat_sessions_user_id', table_name='mock_chat_sessions')
    op.drop_index('ix_mock_chat_sessions_id', table_name='mock_chat_sessions')
    op.drop_table('mock_chat_sessions')