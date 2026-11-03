"""ensure scoring/rule tables exist (BR-A1, BR-B1, BR-B2, BR-B3)

Các migration br01a1d0f00001 / br01b1a0f00003 / br01b2a0f00004 / br01b3a0f00005
chỉ là stub rỗng: bảng được tạo tay ở DB server, nên DB mới (docker local, CI,
server mới) thiếu hết bảng chấm điểm → /api/scoring, /api/rules, /api/reports 500.

Migration này tạo bảng NẾU CHƯA CÓ (schema khớp app/models), DB đã có bảng thì
bỏ qua — không đụng dữ liệu điểm thật.

Revision ID: rep0000000002
Revises: rep0000000001
Create Date: 2026-11-02

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'rep0000000002'
down_revision: Union[str, None] = 'rep0000000001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _create_defense_scores() -> None:
    op.create_table(
        'defense_scores',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('meeting_id', sa.Integer(), nullable=False),
        sa.Column('reviewer_id', sa.Integer(), nullable=True),
        sa.Column('reviewer_name', sa.String(length=100), nullable=False),
        sa.Column('is_ai', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('group', sa.String(length=10), nullable=False),
        sa.Column('item_code', sa.String(length=40), nullable=False),
        sa.Column('mark', sa.Numeric(3, 1), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id']),
        sa.ForeignKeyConstraint(['reviewer_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('meeting_id', 'reviewer_id', 'group', 'item_code', name='uq_defense_score_reviewer_item'),
    )
    op.create_index('ix_defense_scores_id', 'defense_scores', ['id'])
    op.create_index('ix_defense_scores_meeting_id', 'defense_scores', ['meeting_id'])
    op.create_index('ix_defense_scores_reviewer_id', 'defense_scores', ['reviewer_id'])
    op.create_index('ix_defense_scores_group', 'defense_scores', ['group'])


def _create_committee_decisions() -> None:
    op.create_table(
        'committee_decisions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('meeting_id', sa.Integer(), nullable=False),
        sa.Column('reviewer_id', sa.Integer(), nullable=False),
        sa.Column('reviewer_name', sa.String(length=100), nullable=False),
        sa.Column('rule_id', sa.String(length=40), nullable=False),
        sa.Column('decision', sa.String(length=20), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id']),
        sa.ForeignKeyConstraint(['reviewer_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_committee_decisions_id', 'committee_decisions', ['id'])
    op.create_index('ix_committee_decisions_meeting_id', 'committee_decisions', ['meeting_id'])
    op.create_index('ix_committee_decisions_reviewer_id', 'committee_decisions', ['reviewer_id'])
    op.create_index('ix_committee_decisions_rule_id', 'committee_decisions', ['rule_id'])


def _create_use_case_commitments() -> None:
    op.create_table(
        'use_case_commitments',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=False),
        sa.Column('uc_code', sa.String(length=40), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('actor', sa.String(length=100), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='committed'),
        sa.Column('transactions_est', sa.Integer(), nullable=True),
        sa.Column('source', sa.String(length=20), nullable=False, server_default='ai_extracted'),
        sa.Column('source_document_id', sa.Integer(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id']),
        sa.ForeignKeyConstraint(['source_document_id'], ['documents.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('workspace_id', 'uc_code', name='uq_uc_commitment_workspace_code'),
    )
    op.create_index('ix_use_case_commitments_id', 'use_case_commitments', ['id'])
    op.create_index('ix_use_case_commitments_workspace_id', 'use_case_commitments', ['workspace_id'])
    op.create_index('ix_use_case_commitments_status', 'use_case_commitments', ['status'])
    op.create_index('ix_use_case_commitments_source_document_id', 'use_case_commitments', ['source_document_id'])
    op.create_index('ix_uc_commitment_workspace_status', 'use_case_commitments', ['workspace_id', 'status'])


def _create_audit_table(table: str, ref_column: str) -> None:
    """Bảng audit bất biến dùng chung 1 khuôn: ref id + action + actor + snapshot."""
    op.create_table(
        table,
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(ref_column, sa.Integer(), nullable=False),
        sa.Column('action', sa.String(length=10), nullable=False),
        sa.Column('actor_id', sa.Integer(), nullable=True),
        sa.Column('before', sa.Text(), nullable=True),
        sa.Column('after', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(f'ix_{table}_id', table, ['id'])
    op.create_index(f'ix_{table}_{ref_column}', table, [ref_column])


_TABLES = [
    ('defense_scores', _create_defense_scores),
    ('audit_defense_scores', lambda: _create_audit_table('audit_defense_scores', 'score_id')),
    ('committee_decisions', _create_committee_decisions),
    ('use_case_commitments', _create_use_case_commitments),
    ('audit_use_case_commitments', lambda: _create_audit_table('audit_use_case_commitments', 'commitment_id')),
    ('audit_code_analysis_issues', lambda: _create_audit_table('audit_code_analysis_issues', 'issue_id')),
]


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    for table, create in _TABLES:
        if table not in existing:
            create()


def downgrade() -> None:
    # Không drop: ở DB server các bảng này có sẵn từ trước (chứa điểm/quyết định
    # thật), migration không phân biệt được bảng do nó tạo hay đã tồn tại.
    pass
