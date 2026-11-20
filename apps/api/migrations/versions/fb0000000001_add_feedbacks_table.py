"""add feedbacks table

Revision ID: fb0000000001
Revises: pay0000000003, mockhist000000002, 8202896bf01e
Create Date: 2026-11-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fb0000000001'
down_revision: Union[str, tuple[str, ...], None] = (
    'pay0000000003',
    'mockhist000000002',
    '8202896bf01e',
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'feedbacks',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            'user_id',
            sa.Integer(),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'current_plan',
            sa.String(length=50),
            nullable=False,
            server_default='free',
        ),
        sa.Column('overall_rating', sa.Integer(), nullable=False),
        sa.Column('aspect_ratings', sa.JSON(), nullable=True),
        sa.Column('detected_features', sa.JSON(), nullable=True),
        sa.Column('feature_ratings', sa.JSON(), nullable=True),
        sa.Column('low_rating_reasons', sa.JSON(), nullable=True),
        sa.Column('best_thing', sa.Text(), nullable=True),
        sa.Column('suggested_change', sa.Text(), nullable=True),
        sa.Column('will_recommend', sa.Integer(), nullable=True),
        sa.Column('pay_willingness', sa.String(length=100), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index('ix_feedbacks_id', 'feedbacks', ['id'])
    op.create_index('ix_feedbacks_user_id', 'feedbacks', ['user_id'])
    op.create_index('ix_feedbacks_created_at', 'feedbacks', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_feedbacks_created_at', table_name='feedbacks')
    op.drop_index('ix_feedbacks_user_id', table_name='feedbacks')
    op.drop_index('ix_feedbacks_id', table_name='feedbacks')
    op.drop_table('feedbacks')
