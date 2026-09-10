"""add ai_providers, ai_models, feature_ai_config

Admin quản provider/model qua UI — DB là nguồn chính, env chỉ fallback.

Revision ID: aicfg00000001
Revises: msg0000000001
Create Date: 2026-08-29

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'aicfg00000001'
down_revision: Union[str, None] = 'msg0000000001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ai_providers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('base_url', sa.String(length=500), nullable=False),
        sa.Column('api_key', sa.String(length=500), nullable=False, server_default=''),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )
    op.create_index(op.f('ix_ai_providers_id'), 'ai_providers', ['id'], unique=False)
    op.create_index(op.f('ix_ai_providers_name'), 'ai_providers', ['name'], unique=True)

    op.create_table(
        'ai_models',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('provider_name', sa.String(length=50), nullable=False),
        sa.Column('model_id', sa.String(length=200), nullable=False),
        sa.Column('label', sa.String(length=200), nullable=True),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['provider_name'], ['ai_providers.name'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('provider_name', 'model_id', name='uq_ai_models_provider_model'),
    )
    op.create_index(op.f('ix_ai_models_id'), 'ai_models', ['id'], unique=False)
    op.create_index(op.f('ix_ai_models_provider_name'), 'ai_models', ['provider_name'], unique=False)

    op.create_table(
        'feature_ai_config',
        sa.Column('feature', sa.String(length=50), nullable=False),
        sa.Column('provider_name', sa.String(length=50), nullable=False),
        sa.Column('model_id', sa.String(length=200), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['provider_name'], ['ai_providers.name'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('feature'),
    )

    # Seed: import provider từ env hiện tại (nếu có) để không mất cấu hình đang chạy.
    # Env vẫn giữ nguyên — DB chỉ mirror lúc migrate, sau này DB là nguồn chính.
    conn = op.get_bind()
    import os
    env_key = (os.getenv("LOCAL_API_KEY") or "").strip()
    env_url = (os.getenv("LOCAL_BASE_URL") or "").strip()
    env_model = (os.getenv("LOCAL_MODEL") or "").strip()
    if env_key and "PLACEHOLDER" not in env_key.upper() and env_url:
        conn.execute(sa.text(
            "INSERT INTO ai_providers (name, base_url, api_key, enabled, created_at, updated_at) "
            "VALUES ('localhost', :url, :key, true, now(), now()) "
            "ON CONFLICT (name) DO NOTHING"
        ), {"url": env_url, "key": env_key})
        if env_model:
            conn.execute(sa.text(
                "INSERT INTO ai_models (provider_name, model_id, enabled, created_at) "
                "VALUES ('localhost', :model, true, now()) "
                "ON CONFLICT (provider_name, model_id) DO NOTHING"
            ), {"model": env_model})
        # Mapping mặc định: mọi chức năng dùng provider env vừa import
        for feature in ("chat", "workspace_chat", "code_review", "mock_qa",
                        "question_gen", "classify", "feedback"):
            conn.execute(sa.text(
                "INSERT INTO feature_ai_config (feature, provider_name, model_id, updated_at) "
                "VALUES (:f, 'localhost', :m, now()) "
                "ON CONFLICT (feature) DO NOTHING"
            ), {"f": feature, "m": env_model or ""})


def downgrade() -> None:
    op.drop_table('feature_ai_config')
    op.drop_index(op.f('ix_ai_models_provider_name'), table_name='ai_models')
    op.drop_index(op.f('ix_ai_models_id'), table_name='ai_models')
    op.drop_table('ai_models')
    op.drop_index(op.f('ix_ai_providers_name'), table_name='ai_providers')
    op.drop_index(op.f('ix_ai_providers_id'), table_name='ai_providers')
    op.drop_table('ai_providers')
