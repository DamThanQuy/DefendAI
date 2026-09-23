"""merge BR-B2 stub vào master head."""
from typing import Sequence, Union

from alembic import op  # noqa: F401

revision: str = 'merge_br01b2'
down_revision: Union[str, None] = ('merge_inv_br01b1', 'br01b2a0f00004')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
