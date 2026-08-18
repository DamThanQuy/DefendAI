"""add code_analysis_issues + async map-reduce columns on code_analyses

Revision ID: rag0000000009
Revises: i1a2b3c4d5e9
Create Date: 2026-08-09

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'rag0000000009'
down_revision: Union[str, None] = 'i1a2b3c4d5e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CODE_ANALYSIS_STATUS = sa.Enum(
    'queued', 'processing', 'completed', 'failed', name='codeanalysisstatus'
)


def upgrade() -> None:
    # Native Postgres enum must be created explicitly before use as a column type.
    _CODE_ANALYSIS_STATUS.create(op.get_bind(), checkfirst=True)

    # Async pipeline state for the 100k-file map-reduce code review
    op.add_column(
        'code_analyses',
        sa.Column('status', _CODE_ANALYSIS_STATUS, nullable=False, server_default='queued'),
    )
    op.add_column('code_analyses', sa.Column('provider', sa.String(length=50), nullable=True))
    op.add_column('code_analyses', sa.Column('model', sa.String(length=50), nullable=True))
    op.add_column('code_analyses', sa.Column('total_files', sa.Integer(), nullable=True))
    op.add_column('code_analyses', sa.Column('total_modules', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('code_analyses', sa.Column('done_modules', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('code_analyses', sa.Column('stats_json', sa.JSON(), nullable=True))
    op.add_column('code_analyses', sa.Column('error', sa.Text(), nullable=True))
    op.create_index('ix_code_analyses_status', 'code_analyses', ['status'], unique=False)

    op.create_table(
        'code_analysis_issues',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('analysis_id', sa.Integer(), sa.ForeignKey('code_analyses.id'), nullable=False),
        sa.Column('module', sa.String(length=255), nullable=True),
        sa.Column('file', sa.Text(), nullable=False),
        sa.Column('line', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(length=50), nullable=True),
        sa.Column('severity', sa.String(length=20), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('suggestion', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_code_analysis_issues_analysis_id', 'code_analysis_issues', ['analysis_id'], unique=False)
    op.create_index('ix_code_analysis_issues_severity', 'code_analysis_issues', ['severity'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_code_analysis_issues_severity', table_name='code_analysis_issues')
    op.drop_index('ix_code_analysis_issues_analysis_id', table_name='code_analysis_issues')
    op.drop_table('code_analysis_issues')
    op.drop_index('ix_code_analyses_status', table_name='code_analyses')
    op.drop_column('code_analyses', 'error')
    op.drop_column('code_analyses', 'stats_json')
    op.drop_column('code_analyses', 'done_modules')
    op.drop_column('code_analyses', 'total_modules')
    op.drop_column('code_analyses', 'total_files')
    op.drop_column('code_analyses', 'model')
    op.drop_column('code_analyses', 'provider')
    op.drop_column('code_analyses', 'status')
    _CODE_ANALYSIS_STATUS.drop(op.get_bind(), checkfirst=True)