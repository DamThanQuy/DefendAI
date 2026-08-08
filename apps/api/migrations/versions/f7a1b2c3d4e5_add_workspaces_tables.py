"""add workspaces + workspace_files tables

Revision ID: f7a1b2c3d4e5
Revises: de6dcb9f6ac6
Create Date: 2026-08-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f7a1b2c3d4e5'
down_revision: Union[str, None] = 'a3b4c5d6e7f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'workspaces',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_workspaces_id'), 'workspaces', ['id'], unique=False)
    op.create_index(op.f('ix_workspaces_user_id'), 'workspaces', ['user_id'], unique=False)

    op.create_table(
        'workspace_files',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=False),
        sa.Column('document_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False),
        sa.Column('added_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id']),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('workspace_id', 'document_id', name='uq_workspace_document'),
    )
    op.create_index(op.f('ix_workspace_files_document_id'), 'workspace_files', ['document_id'], unique=False)
    op.create_index(op.f('ix_workspace_files_id'), 'workspace_files', ['id'], unique=False)
    op.create_index(op.f('ix_workspace_files_workspace_id'), 'workspace_files', ['workspace_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_workspace_files_workspace_id'), table_name='workspace_files')
    op.drop_index(op.f('ix_workspace_files_id'), table_name='workspace_files')
    op.drop_index(op.f('ix_workspace_files_document_id'), table_name='workspace_files')
    op.drop_table('workspace_files')
    op.drop_index(op.f('ix_workspaces_user_id'), table_name='workspaces')
    op.drop_index(op.f('ix_workspaces_id'), table_name='workspaces')
    op.drop_table('workspaces')
