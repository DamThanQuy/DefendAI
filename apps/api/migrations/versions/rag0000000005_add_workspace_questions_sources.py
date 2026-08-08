"""add sources column to workspace_questions (R6: cited evidence)

Revision ID: rag0000000005
Revises: rag0000000004
Create Date: 2026-08-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'rag0000000005'
down_revision: Union[str, None] = 'rag0000000004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('workspace_questions', sa.Column('sources', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('workspace_questions', 'sources')