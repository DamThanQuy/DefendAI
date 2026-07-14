"""Auth router — Register / Login (bcrypt + JWT) / Google OAuth / Me."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.models.role import Role
from app.models.user import User
from app.models.association import user_roles
from app.schemas.user import (
    AuthResponse,
    GoogleLoginRequest,
    LoginRequest,
    RegisterRequest,
    UserResponse,
)

router = APIRouter(prefix="/api/auth", tags=["Auth"])
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_or_create_role(db: AsyncSession, name: str = "student") -> Role:
    """Lấy role theo name. Nếu chưa có (chưa seed), tạo mới."""
    role = (await db.execute(select(Role).where(Role.name == name))).scalar_one_or_none()
    if not role:
        role = Role(name=name, description=name)
        db.add(role)
        await db.flush()
    return role


async def _make_auth_response(user: User, db: AsyncSession) -> AuthResponse:
    """Tạo JWT + AuthResponse."""
    # Đảm bảo roles đã load (tránh lazy-load trong async)
    await db.refresh(user, ["roles"])
    primary_role = user.roles[0].name if user.roles else "student"
    token = create_access_token(user.id, primary_role)
    return AuthResponse(
        success=True,
        token=token,
        user=UserResponse.from_user(user),
    )

# ---------------------------------------------------------------------------
# Register (email + password)
# ---------------------------------------------------------------------------

@router.post("/register", response_model=AuthResponse, summary="Đăng ký tài khoản mới")
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check email trùng
    existing = (await db.execute(select(User).where(User.email == req.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Email đã tồn tại")

    # Username = email prefix (tự sinh)
    username = req.email.split("@")[0]

    user = User(
        username=username,
        email=req.email,
        hashed_password=hash_password(req.password),
        full_name=req.full_name or username,
        auth_provider="email",
    )
    db.add(user)
    await db.flush()  # get user.id

    # Gán role student mặc định (insert trực tiếp bảng trung gian để tránh lazy-load trong async)
    student_role = await _get_or_create_role(db, "student")
    await db.execute(user_roles.insert().values(user_id=user.id, role_id=student_role.id))

    await db.commit()
    await db.refresh(user)
    return await _make_auth_response(user, db)

# ---------------------------------------------------------------------------
# Login (email + password)
# ---------------------------------------------------------------------------

@router.post("/login", response_model=AuthResponse, summary="Đăng nhập bằng email + mật khẩu")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).options(selectinload(User.roles)).where(User.email == req.email)
    )
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu sai")

    return await _make_auth_response(user, db)

# ---------------------------------------------------------------------------
# Google OAuth (ID token)
# ---------------------------------------------------------------------------

@router.post("/google", response_model=AuthResponse, summary="Đăng nhập bằng Google")
async def google_login(req: GoogleLoginRequest, db: AsyncSession = Depends(get_db)):
    # Verify ID token từ Google Sign-In frontend
    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests

        id_info = id_token.verify_oauth2_token(
            req.id_token,
            google_requests.Request(),
            settings.google_client_id,
        )
    except Exception as e:
        logger.warning("Google token verify failed: %s", e)
        raise HTTPException(status_code=401, detail="Google token không hợp lệ")

    google_sub = id_info.get("sub")
    email = id_info.get("email")
    name = id_info.get("name", email.split("@")[0] if email else "google_user")

    if not email:
        raise HTTPException(status_code=400, detail="Google token không có email")

    # Tìm user theo google_sub hoặc email
    user = (
        await db.execute(
            select(User)
            .options(selectinload(User.roles))
            .where((User.google_sub == google_sub) | (User.email == email))
        )
    ).scalar_one_or_none()

    if not user:
        # Tạo user mới
        username = email.split("@")[0]
        user = User(
            username=username,
            email=email,
            full_name=name,
            auth_provider="google",
            google_sub=google_sub,
        )
        db.add(user)
        await db.flush()
        student_role = await _get_or_create_role(db, "student")
        await db.execute(user_roles.insert().values(user_id=user.id, role_id=student_role.id))
        await db.commit()
        await db.refresh(user)
    elif not user.google_sub:
        # User email/password cũ → link Google account
        user.google_sub = google_sub
        user.auth_provider = "google"
        await db.commit()
        await db.refresh(user, ["roles"])

    return await _make_auth_response(user, db)

# ---------------------------------------------------------------------------
# Me (xem thông tin user hiện tại)
# ---------------------------------------------------------------------------

@router.get("/me", response_model=UserResponse, summary="Thông tin user hiện tại")
async def me(user: User = Depends(get_current_user)):
    return UserResponse.from_user(user)
