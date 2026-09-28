"""merge BR-B1 head với merge_br01_aicfg

Revision ID: merge_br01b1
Revises: br01b1a0f00003, merge_br01_aicfg
Create Date: 2026-09-01
"""
from typing import Sequence, Union

from alembic import op  # noqa: F401

revision: str = 'merge_br01b1'
down_revision: Union[str, None] = ('br01b1a0f00003', 'merge_br01_aicfg')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
