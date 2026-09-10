"""merge BR-B3 stub vào master head."""
from typing import Sequence, Union

from alembic import op  # noqa: F401

revision: str = 'merge_br01b3'
down_revision: Union[str, None] = ('br01b3a0f00005',)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
