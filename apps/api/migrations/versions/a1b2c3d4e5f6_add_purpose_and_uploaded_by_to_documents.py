"""add purpose and uploaded_by to documents

Revision ID: a1b2c3d4e5f6
Revises: de6dcb9f6ac6
Create Date: 2026-07-14 08:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'de6dcb9f6ac6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE TYPE documentpurpose AS ENUM ('student_project', 'staff_reference')"
    )
    op.add_column(
        "documents",
        sa.Column(
            "purpose",
            sa.Enum("student_project", "staff_reference", name="documentpurpose"),
            nullable=False,
            server_default="student_project",
        ),
    )
    op.add_column(
        "documents",
        sa.Column("uploaded_by", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_documents_uploaded_by_users",
        "documents",
        "users",
        ["uploaded_by"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_documents_uploaded_by_users", "documents", type_="foreignkey")
    op.drop_column("documents", "uploaded_by")
    op.drop_column("documents", "purpose")
    op.execute("DROP TYPE documentpurpose")
