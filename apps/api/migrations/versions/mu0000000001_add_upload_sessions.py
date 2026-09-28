"""add upload_sessions table for multipart uploads

Revision ID: mu0000000001
Revises: merge_br01b3
Create Date: 2026-09-03

Cho phép FE upload file lớn (GB) theo từng chunk 8MB lên MinIO qua S3 multipart protocol.
Mỗi session track:
- upload_id (UUID) — client dùng để resume
- s3_upload_id — MinIO multipart upload id (server-side)
- parts_expected / parts_received — tiến độ
- status — pending | completed | aborted
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'mu0000000001'
down_revision: Union[str, None] = 'merge_br01b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'upload_sessions',
        sa.Column('id', sa.String(length=64), primary_key=True),
        sa.Column('storage_key', sa.String(length=256), nullable=False),
        sa.Column('s3_upload_id', sa.String(length=128), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('size', sa.BigInteger(), nullable=False),
        sa.Column('mime', sa.String(length=100), nullable=False, server_default='application/octet-stream'),
        sa.Column('parts_expected', sa.Integer(), nullable=False),
        sa.Column('parts_received', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('document_id', sa.Integer(), sa.ForeignKey('documents.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_upload_sessions_storage_key', 'upload_sessions', ['storage_key'])
    op.create_index('ix_upload_sessions_user_id', 'upload_sessions', ['user_id'])
    op.create_index('ix_upload_sessions_status', 'upload_sessions', ['status'])


def downgrade() -> None:
    op.drop_index('ix_upload_sessions_status', table_name='upload_sessions')
    op.drop_index('ix_upload_sessions_user_id', table_name='upload_sessions')
    op.drop_index('ix_upload_sessions_storage_key', table_name='upload_sessions')
    op.drop_table('upload_sessions')