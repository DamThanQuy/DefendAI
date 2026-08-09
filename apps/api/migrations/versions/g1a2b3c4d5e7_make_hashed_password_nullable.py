"""make hashed_password nullable for Google OAuth users

Revision ID: g1a2b3c4d5e7
Revises: f1a2b3c4d5e6
Create Date: 2026-08-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'g1a2b3c4d5e7'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # User đăng nhập bằng Google không có mật khẩu -> cột phải cho phép NULL
    # Model User đã khai báo nullable=True, nhưng schema DB hiện tại là NOT NULL.
    op.alter_column(
        'users',
        'hashed_password',
        existing_type=sa.String(length=255),
        nullable=True,
    )

def downgrade() -> None:
    op.alter_column(
        'users',
        'hashed_password',
        existing_type=sa.String(length=255),
        nullable=False,
    )
