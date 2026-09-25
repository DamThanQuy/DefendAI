"""add PayOS payment link data

Revision ID: pay0000000002
Revises: pay0000000001
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "pay0000000002"
down_revision: Union[str, None] = "pay0000000001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payment_orders", sa.Column("payment_url", sa.String(length=1000), nullable=True))
    op.add_column("payment_orders", sa.Column("qr_code", sa.String(length=4000), nullable=True))


def downgrade() -> None:
    op.drop_column("payment_orders", "qr_code")
    op.drop_column("payment_orders", "payment_url")