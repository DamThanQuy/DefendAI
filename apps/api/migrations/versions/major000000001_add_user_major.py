"""add users.major (chọn ngành học lúc đăng ký, phục vụ thống kê)

Revision ID: major000000001
Revises: fb0000000001
Create Date: 2026-11-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'major000000001'
down_revision: Union[str, None] = 'fb0000000001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('major', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'major')
