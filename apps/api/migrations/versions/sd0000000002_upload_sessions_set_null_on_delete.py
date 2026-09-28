"""upload_sessions: ON DELETE SET NULL cho FK document_id

Revision ID: sd0000000002
Revises: sd0000000001
Create Date: 2026-09-04

Khi xoá vĩnh viễn document, upload_sessions.document_id phải được SET NULL
(thay vì NO ACTION chặn xoá). Upload session là log tạm — document_id chỉ là
tham chiếu tiện ích, mất thì OK.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'sd0000000002'
down_revision: Union[str, None] = 'sd0000000001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tên constraint mặc định của SQLAlchemy khi tạo FK
    op.drop_constraint(
        'upload_sessions_document_id_fkey',
        'upload_sessions',
        type_='foreignkey',
    )
    op.create_foreign_key(
        'upload_sessions_document_id_fkey',
        'upload_sessions',
        'documents',
        ['document_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint(
        'upload_sessions_document_id_fkey',
        'upload_sessions',
        type_='foreignkey',
    )
    op.create_foreign_key(
        'upload_sessions_document_id_fkey',
        'upload_sessions',
        'documents',
        ['document_id'],
        ['id'],
    )
