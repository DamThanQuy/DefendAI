"""add avatar and wallpaper to user

Revision ID: add_avatar_wallpaper
Revises: prof000000001
Create Date: 2026-09-18 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_avatar_wallpaper'
down_revision = 'prof000000001'
branch_labels = None
depends_on = None


def upgrade():
    # Add avatar column
    op.add_column('users', sa.Column('avatar', sa.String(500), nullable=True))
    # Add wallpaper column
    op.add_column('users', sa.Column('wallpaper', sa.String(500), nullable=True))


def downgrade():
    # Remove wallpaper column
    op.drop_column('users', 'wallpaper')
    # Remove avatar column
    op.drop_column('users', 'avatar')
