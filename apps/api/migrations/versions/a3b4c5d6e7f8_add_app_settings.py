"""add app_settings table

Revision ID: a3b4c5d6e7f8
Revises: a2b3c4d5e6f7
Create Date: 2026-08-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a3b4c5d6e7f8'
down_revision: Union[str, None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'app_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('key', sa.String(length=100), nullable=False),
        sa.Column('value', sa.Text(), nullable=True),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key'),
    )
    op.create_index(op.f('ix_app_settings_id'), 'app_settings', ['id'], unique=False)
    op.create_index(op.f('ix_app_settings_key'), 'app_settings', ['key'], unique=True)

    # Seed defaults — provider routing (khớp config.py)
    op.execute(
        "INSERT INTO app_settings (key, value, description, updated_at) VALUES "
        "('default_provider', 'localhost', 'Provider mặc định cho AI gateway', now()), "
        "('localhost_api_key', '', 'Local LLM API key', now()), "
        "('localhost_base_url', 'http://localhost:20128/v1', 'Local LLM base URL', now()), "
        "('localhost_model', 'google', 'Local LLM model mặc định', now()) "
        "ON CONFLICT (key) DO NOTHING"
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_app_settings_key'), table_name='app_settings')
    op.drop_index(op.f('ix_app_settings_id'), table_name='app_settings')
    op.drop_table('app_settings')