"""merge heads book and google_oauth

Revision ID: 36832a5f71e4
Revises: book0000000001, g1a2b3c4d5e7
Create Date: 2026-08-09 03:19:35.501855

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '36832a5f71e4'
down_revision: Union[str, None] = ('book0000000001', 'g1a2b3c4d5e7')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
