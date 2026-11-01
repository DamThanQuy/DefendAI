"""Add max_documents_per_month to subscription plans (enforce Free 3 docs/month).

Revision ID: sub0000000004
Revises: major000000001
Create Date: 2026-11-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "sub0000000004"
down_revision: Union[str, None] = "major000000001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "subscription_plans",
        sa.Column("max_documents_per_month", sa.Integer(), nullable=True),
    )
    # Free: 3 đồ án/tháng; Premium/VIP: NULL = không giới hạn
    op.execute("UPDATE subscription_plans SET max_documents_per_month = 3 WHERE slug = '100001'")


def downgrade() -> None:
    op.drop_column("subscription_plans", "max_documents_per_month")
