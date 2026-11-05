"""khoá tính năng theo gói: đếm lượt dùng thử Mock AI trên server, ghi đúng quyền lợi trên bảng giá

- mock_chat_sessions.trial_turns_used: số lượt đã chat trong phiên mở bằng vé trải nghiệm.
  NULL là phiên không mở bằng vé, người không có gói VIP chỉ xem lại được.
- Bảng giá: Free chỉ được 1 lịch Mock Room với mentor, Phòng Mock AI chỉ có ở VIP.
  Chỉ sửa đúng các dòng mặc định, gói và dòng admin đã đổi thì giữ nguyên.

Revision ID: mbr0000000001
Revises: sub0000000004
Create Date: 2026-11-05

"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "mbr0000000001"
down_revision: Union[str, None] = "sub0000000004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RENAMED = {
    "100001": ("Mock defense 1 lần / tháng", "Mock Room với mentor: 1 lần"),
    "100002": ("Mock defense không giới hạn", "Mock Room với mentor không giới hạn"),
    "100003": ("Mock defense ưu tiên + record phiên", "Mock Room với mentor ưu tiên + record phiên"),
}
MOCK_AI_LINE = {
    "100001": {"label": "Phòng Mock AI", "included": False},
    "100002": {"label": "Phòng Mock AI", "included": False},
    "100003": {"label": "Phòng Mock AI không giới hạn", "included": True, "highlight": True},
}


def _load(value):
    return json.loads(value) if isinstance(value, str) else (value or [])


def _save(conn, slug: str, features: list) -> None:
    conn.execute(
        sa.text(
            "UPDATE subscription_plans SET features = CAST(:features AS json), updated_at = timezone('utc', now()) "
            "WHERE slug = :slug"
        ),
        {"features": json.dumps(features, ensure_ascii=False), "slug": slug},
    )


def upgrade() -> None:
    op.add_column("mock_chat_sessions", sa.Column("trial_turns_used", sa.Integer(), nullable=True))

    conn = op.get_bind()
    for slug, (old_label, new_label) in RENAMED.items():
        row = conn.execute(sa.text("SELECT features FROM subscription_plans WHERE slug = :slug"), {"slug": slug}).first()
        if row is None:
            continue
        features = _load(row[0])
        for feature in features:
            if feature.get("label") == old_label:
                feature["label"] = new_label
        if not any("Mock AI" in (feature.get("label") or "") for feature in features):
            line = MOCK_AI_LINE[slug]
            features.insert(1, line) if line["included"] else features.append(line)
        _save(conn, slug, features)


def downgrade() -> None:
    conn = op.get_bind()
    for slug, (old_label, new_label) in RENAMED.items():
        row = conn.execute(sa.text("SELECT features FROM subscription_plans WHERE slug = :slug"), {"slug": slug}).first()
        if row is None:
            continue
        features = [f for f in _load(row[0]) if f.get("label") != MOCK_AI_LINE[slug]["label"]]
        for feature in features:
            if feature.get("label") == new_label:
                feature["label"] = old_label
        _save(conn, slug, features)

    op.drop_column("mock_chat_sessions", "trial_turns_used")
