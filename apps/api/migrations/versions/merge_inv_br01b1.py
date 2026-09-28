"""merge inv0000000001 (master branch) với merge_br01b1 (BR-A1 + BR-B1)

Revision ID: merge_inv_br01b1
Revises: inv0000000001, merge_br01b1
Create Date: 2026-09-02

Được tạo tự động để hợp nhất 2 head chain (master có inv0000000001,
branch BR-A1+B1 có merge_br01b1) → 1 head duy nhất cho alembic upgrade head.
"""
from typing import Sequence, Union

from alembic import op  # noqa: F401

# revision identifiers, used by Alembic.
revision: str = 'merge_inv_br01b1'
down_revision: Union[str, None] = ('inv0000000001', 'merge_br01b1')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
