"""Seed embedding + vision feature config.

Thêm 2 feature mới vào feature_ai_config để admin quản lý model embedding
và vision qua UI (DB-driven), thay vì hardcode env.

Revision ID: aicfg00000002
Revises: merge_br01_aicfg
Create Date: 2026-09-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'aicfg00000002'
down_revision: Union[str, None] = 'merge_br01_aicfg'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Seed 'embedding' + 'vision' features nếu DB đã có provider enabled."""
    conn = op.get_bind()

    # Lấy provider có key thực (không phải placeholder) để làm nguồn mặc định.
    # DB là nguồn chính; nếu DB chưa có provider thì để trống — env sẽ fallback.
    row = conn.execute(sa.text(
        "SELECT name FROM ai_providers "
        "WHERE enabled = true AND api_key != '' AND base_url != '' "
        "ORDER BY created_at ASC LIMIT 1"
    )).fetchone()
    default_provider = row[0] if row else None

    # Seed feature_ai_config cho embedding (ưu tiên NVIDIA nếu có, fallback Google/localhost)
    if default_provider:
        # Lấy model đầu tiên của provider mặc định
        m = conn.execute(sa.text(
            "SELECT model_id FROM ai_models WHERE provider_name = :p AND enabled = true "
            "ORDER BY id ASC LIMIT 1"
        ), {"p": default_provider}).fetchone()
        default_model = m[0] if m else ""

        for feature in ("embedding", "vision"):
            conn.execute(sa.text(
                "INSERT INTO feature_ai_config (feature, provider_name, model_id, updated_at) "
                "VALUES (:f, :p, :m, now()) "
                "ON CONFLICT (feature) DO NOTHING"
            ), {"f": feature, "p": default_provider, "m": default_model or ""})

        # Nếu provider mặc định chưa có model, seed một model giả (admin sẽ cập nhật).
        if not default_model:
            # Tạo ai_models mẫu dựa trên provider name
            if default_provider in ("nvidia", "localhost"):
                default_model = "nvidia/nemotron-embed-001" if default_provider == "nvidia" else "google"
            else:
                default_model = "gemini-embedding-001"
            conn.execute(sa.text(
                "INSERT INTO ai_models (provider_name, model_id, enabled, created_at) "
                "VALUES (:p, :m, true, now()) "
                "ON CONFLICT (provider_name, model_id) DO NOTHING"
            ), {"p": default_provider, "m": default_model})
            conn.execute(sa.text(
                "UPDATE feature_ai_config SET model_id = :m WHERE feature IN ('embedding','vision') "
                "AND provider_name = :p AND (model_id IS NULL OR model_id = '')"
            ), {"p": default_provider, "m": default_model})


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM feature_ai_config WHERE feature IN ('embedding','vision')"))
