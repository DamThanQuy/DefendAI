"""rubric defense_sep490: thêm item_order (thứ tự hiển thị hạng mục OGA/TDA)

Model Rubric khai báo config là JSONB → khi ghi, Postgres sắp lại key của
object theo độ dài ("qa", "pmp", "sdd", ...), nên dict `grading.*.items` đọc từ
DB không còn theo thứ tự syllabus. List giữ nguyên thứ tự → lưu thứ tự vào
`item_order`. Rubric đã có `item_order` (admin tự chỉnh) thì giữ nguyên.

Revision ID: rep0000000003
Revises: rep0000000002
Create Date: 2026-11-02

"""
import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'rep0000000003'
down_revision: Union[str, None] = 'rep0000000002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ITEM_ORDER = [
    "introduction", "pmp", "srs", "sdd", "testing",
    "user_guides", "implementation", "presentation", "qa",
]


def upgrade() -> None:
    bind = op.get_bind()
    row = bind.execute(
        sa.text("SELECT id, config FROM rubrics WHERE key = 'defense_sep490'")
    ).fetchone()
    if row is None:
        return  # chưa seed → seed_rubrics.py đã có item_order
    config = row.config if isinstance(row.config, dict) else json.loads(row.config)
    if config.get("item_order"):
        return
    config["item_order"] = ITEM_ORDER
    bind.execute(
        sa.text(
            "UPDATE rubrics SET config = :config, "
            "updated_at = timezone('utc', now()) WHERE id = :id"
        ),
        {"config": json.dumps(config, ensure_ascii=False), "id": row.id},
    )


def downgrade() -> None:
    # Giữ item_order: chỉ là metadata hiển thị, code cũ bỏ qua key này.
    pass
