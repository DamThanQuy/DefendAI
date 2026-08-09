"""add mentor_availability + booking.reject_reason

Revision ID: i1a2b3c4d5e9
Revises: h1a2b3c4d5e8
Create Date: 2026-08-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'i1a2b3c4d5e9'
down_revision: Union[str, None] = 'h1a2b3c4d5e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table(
        'mentor_availability',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('mentor_id', sa.Integer(), nullable=False),
        sa.Column('day_of_week', sa.Integer(), nullable=False),
        sa.Column('start_time', sa.String(length=5), nullable=False),
        sa.Column('end_time', sa.String(length=5), nullable=False),
        sa.Column('is_available', sa.Boolean(), nullable=False),
        sa.Column('week_pattern', sa.String(length=20), nullable=False),
        sa.ForeignKeyConstraint(['mentor_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('mentor_id', 'day_of_week', 'start_time', 'week_pattern', name='uq_mentor_slot'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_mentor_availability_id'), 'mentor_availability', ['id'], unique=False)
    op.create_index(op.f('ix_mentor_availability_mentor_id'), 'mentor_availability', ['mentor_id'], unique=False)

    op.add_column('mock_bookings', sa.Column('reject_reason', sa.String(length=500), nullable=True))

def downgrade() -> None:
    op.drop_column('mock_bookings', 'reject_reason')
    op.drop_index(op.f('ix_mentor_availability_mentor_id'), table_name='mentor_availability')
    op.drop_index(op.f('ix_mentor_availability_id'), table_name='mentor_availability')
    op.drop_table('mentor_availability')
