"""Add extensible profile data for user settings."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "u0000000002"
down_revision: Union[str, None] = "sub0000000003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("profile_data", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )
    op.alter_column("users", "profile_data", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "profile_data")