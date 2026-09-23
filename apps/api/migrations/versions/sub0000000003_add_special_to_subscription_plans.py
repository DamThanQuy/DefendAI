"""Add a special visual flag to subscription plans."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "sub0000000003"
down_revision: Union[str, None] = "sub0000000002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "subscription_plans",
        sa.Column("special", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("subscription_plans", "special", server_default=None)


def downgrade() -> None:
    op.drop_column("subscription_plans", "special")