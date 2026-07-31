"""Migration: create refresh_tokens table."""
from app.core.database import Base, engine
from app.models.refresh_token import RefreshToken


def upgrade():
    Base.metadata.create_all(bind=engine, tables=[RefreshToken.__table__])


def downgrade():
    Base.metadata.drop_all(bind=engine, tables=[RefreshToken.__table__])


if __name__ == "__main__":
    import asyncio

    async def main():
        async with engine.connect() as conn:
            await conn.run_sync(Base.metadata.create_all, tables=[RefreshToken.__table__])
            await conn.commit()
        print("Created refresh_tokens table")

    asyncio.run(main())
