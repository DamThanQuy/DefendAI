"""add code_module_hashes table for caching module scan results

Revision ID: hash0000000001
Revises: mu0000000001
Create Date: 2026-09-03

Cache hash nội dung module để skip LLM khi re-scan cùng nội dung.
Đề xuất 1 từ NotebookLM: băm SHA256 tổng hợp path + content của từng module.
Khi user upload lại ZIP đã từng scan, các module có hash trùng sẽ clone
issue cũ sang analysis mới, bỏ qua LLM call → tiết kiệm ~80% cost.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'hash0000000001'
down_revision: Union[str, None] = 'mu0000000001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'code_module_hashes',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('document_id', sa.Integer(), sa.ForeignKey('documents.id'), nullable=False, index=True),
        sa.Column('module', sa.String(length=255), nullable=False),
        sa.Column('content_hash', sa.String(length=64), nullable=False, index=True),
        sa.Column('issue_ids_json', sa.JSON(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()')),
    )
    op.create_index('ix_doc_module_hash', 'code_module_hashes', ['document_id', 'module'])


def downgrade() -> None:
    op.drop_index('ix_doc_module_hash', table_name='code_module_hashes')
    op.drop_table('code_module_hashes')
