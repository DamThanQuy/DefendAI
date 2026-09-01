"""merge BR-A1 head với aicfg head (2 branch độc lập từ rub0000000001)

Revision ID: merge_br01_aicfg
Revises: aicfg00000001, br01a1d0f00001
Create Date: 2026-09-01

"""
from typing import Sequence, Union

from alembic import op  # noqa: F401

# revision identifiers, used by Alembic.
revision: str = 'merge_br01_aicfg'
down_revision: Union[str, None] = ('aicfg00000001', 'br01a1d0f00001')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
