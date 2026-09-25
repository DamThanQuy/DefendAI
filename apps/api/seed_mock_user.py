"""Seed mock user cho development (không cần database thật)"""
import asyncio
import sys
from pathlib import Path
from sqlalchemy import text

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.core.database import async_session_maker
from app.models.user import User
from app.models.role import Role
from app.models.association import user_roles
from app.core.security import hash_password


async def seed_mock_user():
    """Tạo mock user cho development"""
    async with async_session_maker() as db:
        # Check if user already exists
        result = await db.execute(text("SELECT id FROM users WHERE email = 'student@defendai.dev'"))
        if result.scalar_one_or_none():
            print("✓ User already exists")
            return

        # Create role
        role = Role(name="student", description="Student role")
        db.add(role)
        await db.flush()

        # Create user
        user = User(
            email="student@defendai.dev",
            name="Student User",
            hashed_password=hash_password("DefendAI@123"),
            avatar="/avatar.jpg"
        )
        db.add(user)
        await db.flush()

        # Add role to user
        await user_roles.insert().values(user_id=user.id, role_id=role.id)

        await db.commit()
        print("✓ Mock user created successfully")
        print("  Email: student@defendai.dev")
        print("  Password: DefendAI@123")


if __name__ == "__main__":
    asyncio.run(seed_mock_user())
