"""rename file_path → storage_key

Revision ID: 5e3b2c7f1d8e
Revises: a72218e41585
Create Date: 2026-07-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision: str = "5e3b2c7f1d8e"
down_revision: Union[str, None] = "a72218e41585"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "documents",
        "file_path",
        new_column_name="storage_key",
        existing_type=sa.String(512),
        type_=sa.String(256),
    )


def downgrade() -> None:
    op.alter_column(
        "documents",
        "storage_key",
        new_column_name="file_path",
        existing_type=sa.String(256),
        type_=sa.String(512),
    )