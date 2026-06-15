"""add remaining tables: users, sessions, meetings, meeting_members, evaluations, reports

Revision ID: b752f9a77c31
Revises: a72218e41585
Create Date: 2026-06-07 21:25:26.636429

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b752f9a77c31'
down_revision: Union[str, None] = 'a72218e41585'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tạo các enum types mới (chỉ tạo nếu chưa tồn tại)
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'documentstatus') THEN CREATE TYPE documentstatus AS ENUM ('uploaded', 'processing', 'completed', 'failed'); END IF; END $$")
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meetingstatus') THEN CREATE TYPE meetingstatus AS ENUM ('scheduled', 'active', 'ended'); END IF; END $$")
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'memberrole') THEN CREATE TYPE memberrole AS ENUM ('chairperson', 'secretary', 'reviewer', 'student'); END IF; END $$")

    # Tạo bảng users
    op.create_table('users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(length=100), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=True),
        sa.Column('is_active', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)

    # Tạo bảng sessions
    op.create_table('sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='active'),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sessions_id'), 'sessions', ['id'], unique=False)

    # Tạo bảng meetings (sử dụng String thay vì Enum để tránh lỗi create_type)
    op.create_table('meetings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='scheduled'),
        sa.Column('phase', sa.String(length=50), nullable=False, server_default='presentation'),
        sa.Column('timer_seconds', sa.Integer(), nullable=False, server_default='900'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_meetings_id'), 'meetings', ['id'], unique=False)

    # Tạo bảng meeting_members (sử dụng String thay vì Enum để tránh lỗi create_type)
    op.create_table('meeting_members',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('meeting_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('role', sa.String(length=50), nullable=False),
        sa.Column('joined_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_meeting_members_id'), 'meeting_members', ['id'], unique=False)
    op.create_index(op.f('ix_meeting_members_meeting_id'), 'meeting_members', ['meeting_id'], unique=False)

    # Tạo bảng evaluations
    op.create_table('evaluations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('meeting_id', sa.Integer(), nullable=False),
        sa.Column('reviewer_name', sa.String(length=100), nullable=False),
        sa.Column('scores', sa.JSON(), nullable=False),
        sa.Column('radar_data', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_evaluations_id'), 'evaluations', ['id'], unique=False)
    op.create_index(op.f('ix_evaluations_meeting_id'), 'evaluations', ['meeting_id'], unique=False)

    # Tạo bảng reports
    op.create_table('reports',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('evaluation_id', sa.Integer(), nullable=False),
        sa.Column('ai_feedback', sa.Text(), nullable=True),
        sa.Column('weaknesses', sa.JSON(), nullable=True),
        sa.Column('pdf_path', sa.String(length=512), nullable=True),
        sa.Column('pass_rate', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['evaluation_id'], ['evaluations.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_reports_id'), 'reports', ['id'], unique=False)
    op.create_index(op.f('ix_reports_evaluation_id'), 'reports', ['evaluation_id'], unique=False)

    # Thêm cột status vào bảng documents nếu chưa có (sử dụng String thay vì Enum)
    op.add_column('documents', sa.Column('status', sa.String(length=50), nullable=False, server_default='uploaded'))


def downgrade() -> None:
    # Xóa các bảng theo thứ tự ngược lại (do foreign key)
    op.drop_table('reports')
    op.drop_table('evaluations')
    op.drop_table('meeting_members')
    op.drop_table('meetings')
    op.drop_table('sessions')
    op.drop_table('users')