"""add mock_bookings table

Revision ID: book0000000001
Revises: rag0000000006
Create Date: 2026-08-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'book0000000001'
down_revision: Union[str, None] = 'rag0000000008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'mock_bookings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('mentor_id', sa.Integer(), nullable=False),
        sa.Column('proposed_time', sa.DateTime(), nullable=False),
        sa.Column('confirmed_time', sa.DateTime(), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('note', sa.String(length=1000), nullable=True),
        sa.Column(
            'status',
            sa.Enum(
                'pending', 'confirmed', 'rejected', 'completed', 'cancelled',
                name='bookingstatus',
            ),
            nullable=False,
        ),
        sa.Column('meeting_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['student_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['mentor_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_mock_bookings_id'), 'mock_bookings', ['id'], unique=False)
    op.create_index(op.f('ix_mock_bookings_student_id'), 'mock_bookings', ['student_id'], unique=False)
    op.create_index(op.f('ix_mock_bookings_mentor_id'), 'mock_bookings', ['mentor_id'], unique=False)
    op.create_index(op.f('ix_mock_bookings_status'), 'mock_bookings', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_mock_bookings_status'), table_name='mock_bookings')
    op.drop_index(op.f('ix_mock_bookings_mentor_id'), table_name='mock_bookings')
    op.drop_index(op.f('ix_mock_bookings_student_id'), table_name='mock_bookings')
    op.drop_index(op.f('ix_mock_bookings_id'), table_name='mock_bookings')
    op.drop_table('mock_bookings')
    sa.Enum(name='bookingstatus').drop(op.get_bind(), checkfirst=True)
