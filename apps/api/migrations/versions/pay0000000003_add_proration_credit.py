"""store subscription upgrade proration credit

Revision ID: pay0000000003
Revises: pay0000000002
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "pay0000000003"
down_revision: Union[str, None] = "pay0000000002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payment_orders", sa.Column("proration_credit", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("payment_orders", "proration_credit")