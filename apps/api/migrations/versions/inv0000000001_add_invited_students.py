"""add invited_students JSON column to mock_bookings

Revision ID: inv0000000001
Revises: 36832a5f71e4
Create Date: 2026-08-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'inv0000000001'
down_revision: Union[str, None] = '36832a5f71e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Danh sách sinh viên được mời thêm vào phòng Mock Room.
    # Lưu dạng JSON: [{"user_id": 12, "name": "Nguyễn Văn B"}, ...]
    op.add_column(
        'mock_bookings',
        sa.Column('invited_students', sa.JSON(), nullable=True),
    )

def downgrade() -> None:
    op.drop_column('mock_bookings', 'invited_students')
