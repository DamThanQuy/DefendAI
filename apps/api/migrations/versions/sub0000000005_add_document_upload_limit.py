"""Add the monthly document upload limit to subscription plans.

Revision ID: sub0000000005
Revises: mbr0000000001
"""

import sqlalchemy as sa
from alembic import op

revision = "sub0000000005"
down_revision = "mbr0000000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "subscription_plans",
        sa.Column("max_documents_per_month", sa.Integer(), nullable=True),
    )
    op.execute(
        "UPDATE subscription_plans SET max_documents_per_month = 3 "
        "WHERE slug = '100001'"
    )


def downgrade() -> None:
    op.drop_column("subscription_plans", "max_documents_per_month")
