"""sửa giá năm của các gói: form admin cũ ghi đè yearly = monthly

Form admin cũ chỉ có một ô giá nên mỗi lần lưu gói, giá năm bị ghi đè bằng giá tháng
(Premium 99.000đ/năm, VIP 199.000đ/năm). Đưa về 10 tháng, đúng với giá mặc định
(990.000đ và 1.990.000đ, tiết kiệm 17%). Gói đã có giá năm khác giá tháng thì giữ nguyên.

Revision ID: sub0000000004
Revises: pwr0000000001
Create Date: 2026-11-05

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'sub0000000004'
down_revision: Union[str, None] = 'pwr0000000001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE subscription_plans "
        "SET yearly = monthly * 10, updated_at = timezone('utc', now()) "
        "WHERE monthly > 0 AND yearly = monthly"
    )


def downgrade() -> None:
    # Không khôi phục giá sai.
    pass
