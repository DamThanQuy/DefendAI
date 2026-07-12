"""merge: storage_key + all 9 tables

Revision ID: c0ffee000001
Revises: 5e3b2c7f1d8e, b752f9a77c31
Create Date: 2026-07-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision: str = 'c0ffee000001'
down_revision: Union[str, None] = ('5e3b2c7f1d8e', 'b752f9a77c31')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
