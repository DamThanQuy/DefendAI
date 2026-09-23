"""Restore the original feature descriptions for the three default plans."""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "sub0000000002"
down_revision: Union[str, None] = "sub0000000001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    features = {
        "100001": [
            {"label": "Upload tối đa 3 đồ án / tháng", "included": True},
            {"label": "Phân tích tài liệu bằng AI cơ bản", "included": True},
            {"label": "Tạo 20 câu hỏi phản biện / lượt", "included": True},
            {"label": "Mock defense 1 lần / tháng", "included": True},
            {"label": "Báo cáo PDF cơ bản", "included": True},
            {"label": "Phân tích code chuyên sâu", "included": False},
            {"label": "Đánh giá theo rubric chi tiết", "included": False},
            {"label": "Hỗ trợ mentor 1-1", "included": False},
        ],
        "100002": [
            {"label": "Upload không giới hạn đồ án", "included": True, "highlight": True},
            {"label": "Phân tích tài liệu AI nâng cao", "included": True},
            {"label": "Không giới hạn câu hỏi phản biện", "included": True},
            {"label": "Mock defense không giới hạn", "included": True, "highlight": True},
            {"label": "Báo cáo PDF chi tiết + biểu đồ", "included": True},
            {"label": "Phân tích code chuyên sâu", "included": True},
            {"label": "Đánh giá theo rubric chi tiết", "included": True},
            {"label": "Hỗ trợ mentor 1-1", "included": False},
        ],
        "100003": [
            {"label": "Tất cả tính năng Premium", "included": True, "highlight": True},
            {"label": "Phân tích tài liệu AI cao cấp (GPT-4o)", "included": True},
            {"label": "Câu hỏi phản biện chuyên sâu theo ngành", "included": True},
            {"label": "Mock defense ưu tiên + record phiên", "included": True},
            {"label": "Báo cáo PDF chuyên nghiệp cho hội đồng", "included": True},
            {"label": "Phân tích code + đề xuất cải thiện", "included": True},
            {"label": "Đánh giá rubric + so sánh top sinh viên", "included": True},
        ],
    }
    connection = op.get_bind()
    for slug, value in features.items():
        connection.execute(
            sa.text("UPDATE subscription_plans SET features = CAST(:features AS json) WHERE slug = :slug"),
            {"slug": slug, "features": json.dumps(value, ensure_ascii=False)},
        )


def downgrade() -> None:
    pass