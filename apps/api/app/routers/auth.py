"""Auth router — Login / Register (prototype, JWT đơn giản)."""
import hashlib
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User

router = APIRouter(prefix="/api/auth", tags=["Auth"])


def _hash_password(password: str) -> str:
    """SHA-256 hash (prototype — production dùng bcrypt)."""
    return hashlib.sha256(password.encode()).hexdigest()


def _create_token(user_id: int) -> str:
    """Tạo pseudo JWT token (prototype)."""
    return f"token_{user_id}_{int(time.time())}"


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=6)
    full_name: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    success: bool
    token: str
    user_id: int
    username: str


@router.post("/register", response_model=AuthResponse, summary="Đăng ký tài khoản mới")
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check username exists
    existing = await db.execute(select(User).where(User.username == req.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username đã tồn tại")

    # Check email exists
    existing_email = await db.execute(select(User).where(User.email == req.email))
    if existing_email.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email đã tồn tại")

    user = User(
        username=req.username,
        email=req.email,
        hashed_password=_hash_password(req.password),
        full_name=req.full_name or req.username,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = _create_token(user.id)
    return AuthResponse(success=True, token=token, user_id=user.id, username=user.username)


@router.post("/login", response_model=AuthResponse, summary="Đăng nhập")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == req.username))
    user = result.scalar_one_or_none()

    if not user or user.hashed_password != _hash_password(req.password):
        raise HTTPException(status_code=401, detail="Sai username hoặc password")

    token = _create_token(user.id)
    return AuthResponse(success=True, token=token, user_id=user.id, username=user.username)
