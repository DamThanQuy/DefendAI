"""merge aicfg00000002 + u0000000002

Revision ID: 8202896bf01e
Revises: aicfg00000002, u0000000002
Create Date: 2026-09-12 13:24:11.671450

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8202896bf01e'
down_revision: Union[str, None] = ('aicfg00000002', 'u0000000002')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
