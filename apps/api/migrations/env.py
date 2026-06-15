import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Cấu hình logging
config = context.config

# Đọc database URL từ file .env hoặc sử dụng default
# Chuyển đổi asyncpg URL sang sync URL cho Alembic
def get_database_url():
    """Lấy database URL cho Alembic (sử dụng sync driver)"""
    # 1) Nếu có env var DATABASE_URL thì ưu tiên dùng nó (tiện cho docker run --env)
    env_url = os.environ.get('DATABASE_URL')
    if env_url:
        return env_url.replace('postgresql+asyncpg://', 'postgresql://')

    # 2) Nếu không có env var, đọc từ file .env
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('DATABASE_URL='):
                    url = line.strip().split('=', 1)[1]
                    # Chuyển asyncpg sang sync driver cho Alembic
                    return url.replace('postgresql+asyncpg://', 'postgresql://')
    # Default URL
    return "postgresql://postgres:postgres@localhost:5433/defense_db"

# Set database URL cho Alembic
config.set_main_option("sqlalchemy.url", get_database_url())

# Import tất cả models để Alembic có thể detect schema
from app.core.database import Base
from app.models.entities import (
    User,
    Document,
    Assessment,
    CodeAnalysis,
    Meeting,
    MeetingMember,
    Evaluation,
    Report,
)
from app.models.session import Session

# Metadata cho autogenerate
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Chạy migrations ở 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Chạy migrations ở 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
