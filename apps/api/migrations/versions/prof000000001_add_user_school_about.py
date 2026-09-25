"""add users.school and users.about (edit profile feature)

Revision ID: prof000000001
Revises: aicfg00000001, inv0000000001
Create Date: 2026-09-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'prof000000001'
down_revision: Union[str, None] = ('aicfg00000001', 'inv0000000001')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('school', sa.String(length=255), nullable=True))
    op.add_column('users', sa.Column('about', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'about')
    op.drop_column('users', 'school')
