"""add subscription plans

Revision ID: sub0000000001
Revises: analysis0000000003
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "sub0000000001"
down_revision: Union[str, None] = "analysis0000000003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subscription_plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(length=50), nullable=False, unique=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("tagline", sa.String(length=255), nullable=False),
        sa.Column("icon", sa.String(length=20), nullable=False),
        sa.Column("monthly", sa.Integer(), nullable=False),
        sa.Column("yearly", sa.Integer(), nullable=False),
        sa.Column("featured", sa.Boolean(), nullable=False),
        sa.Column("badge", sa.String(length=100), nullable=True),
        sa.Column("cta", sa.String(length=100), nullable=False),
        sa.Column("features", sa.JSON(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("subscription_plans")
