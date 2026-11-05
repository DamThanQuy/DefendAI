"""Auth router — Register / Login (bcrypt + JWT) / Google OAuth / Me / Refresh Token / Quên mật khẩu."""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import (
    PASSWORD_RESET_OTP_EXPIRE_MINUTES,
    PASSWORD_RESET_OTP_MAX_ATTEMPTS,
    create_access_token,
    create_password_reset_otp,
    create_refresh_token,
    password_reset_otp_expires_at,
    password_reset_otp_matches,
    refresh_token_expires_at,
    hash_password,
    verify_password,
)
from app.models.password_reset_otp import PasswordResetOtp
from app.models.role import Role
from app.models.user import User
from app.models.association import user_roles
from app.models.refresh_token import RefreshToken
from app.schemas.user import (
    AuthResponse,
    ForgotPasswordRequest,
    GoogleLoginRequest,
    LoginRequest,
    RefreshTokenRequest,
    RegisterRequest,
    ResetPasswordRequest,
    UserResponse,
    UserProfileUpdate,
    VerifyResetOtpRequest,
)
from app.services.email_service import is_email_configured, send_password_reset_email

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
    """Tạo JWT + refresh token + AuthResponse."""
    await db.refresh(user, ["roles"])
    primary_role = user.roles[0].name if user.roles else "student"
    access_token = create_access_token(user.id, primary_role)
    refresh_token = create_refresh_token(user.id)
    db.add(
        RefreshToken(
            user_id=user.id,
            token=refresh_token,
            expires_at=refresh_token_expires_at(),
            revoked=False,
        )
    )
    await db.commit()
    return AuthResponse(
        success=True,
        token=access_token,
        refresh_token=refresh_token,
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
        major=req.major,
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
            clock_skew_in_seconds=60,  # bù sai lệch đồng hồ container/host
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


@router.put("/me", response_model=UserResponse, summary="Cập nhật hồ sơ cá nhân")
async def update_me(
    req: UserProfileUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if req.full_name is not None:
        name = req.full_name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Họ và tên không được để trống")
        user.full_name = name
    if req.major is not None:
        user.major = req.major
    # None = "không đổi" — onboarding chỉ gửi major, không được xoá sạch profile_data cũ.
    if req.profile_data is not None:
        user.profile_data = req.profile_data
    await db.commit()
    await db.refresh(user, ["roles"])
    return UserResponse.from_user(user)


@router.post("/refresh", response_model=AuthResponse, summary="Đổi refresh token lấy access token mới")
async def refresh(req: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token == req.refresh_token)
    )
    rt = result.scalar_one_or_none()
    if not rt or rt.revoked or rt.expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="Refresh token không hợp lệ")
    # Rotate: revoke old, issue new
    rt.revoked = True
    user = (
        await db.execute(
            select(User).options(selectinload(User.roles)).where(User.id == rt.user_id)
        )
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User không tồn tại")
    await db.refresh(user, ["roles"])
    primary_role = user.roles[0].name if user.roles else "student"
    new_access = create_access_token(user.id, primary_role)
    new_refresh = create_refresh_token(user.id)
    db.add(
        RefreshToken(
            user_id=user.id,
            token=new_refresh,
            expires_at=refresh_token_expires_at(),
            revoked=False,
        )
    )
    await db.commit()
    return AuthResponse(
        success=True,
        token=new_access,
        refresh_token=new_refresh,
        user=UserResponse.from_user(user),
    )

# ---------------------------------------------------------------------------
# Quên mật khẩu: gửi mã OTP qua email → kiểm tra mã → đặt mật khẩu mới
# ---------------------------------------------------------------------------

RESET_EMAIL_COOLDOWN = timedelta(seconds=60)
RESET_EMAIL_MAX_PER_HOUR = 5
# Dùng chung cho mọi trường hợp thất bại để không lộ email nào đã đăng ký.
INVALID_OTP_DETAIL = "Mã xác nhận không đúng hoặc đã hết hạn. Nếu đã nhập sai nhiều lần, hãy gửi lại mã mới."


async def _lock_user_by_email(db: AsyncSession, email: str) -> User | None:
    """Khoá dòng user để mọi yêu cầu quên / đặt lại của một tài khoản chạy tuần tự:
    gửi đồng thời không vượt được giới hạn email, đoán đồng thời không vượt được số lần thử.
    key_share: không chặn các insert khác có khoá ngoại tới user (vd refresh token khi đăng nhập).
    """
    return (
        await db.execute(
            select(User)
            .where(func.lower(User.email) == email)
            .order_by(User.id)
            .with_for_update(key_share=True)
        )
    ).scalars().first()


async def _reset_email_allowed(db: AsyncSession, user_id: int, now: datetime) -> bool:
    """Chống spam hộp thư: tối đa 1 email/phút và 5 email/giờ cho mỗi tài khoản."""
    sent_at = (
        await db.execute(
            select(PasswordResetOtp.created_at)
            .where(
                PasswordResetOtp.user_id == user_id,
                PasswordResetOtp.created_at > now - timedelta(hours=1),
            )
            .order_by(PasswordResetOtp.created_at.desc())
        )
    ).scalars().all()
    if len(sent_at) >= RESET_EMAIL_MAX_PER_HOUR:
        return False
    return not sent_at or now - sent_at[0] >= RESET_EMAIL_COOLDOWN


async def _invalidate_reset_otps(db: AsyncSession, user_id: int, now: datetime) -> None:
    await db.execute(
        update(PasswordResetOtp)
        .where(PasswordResetOtp.user_id == user_id, PasswordResetOtp.used_at.is_(None))
        .values(used_at=now)
    )


@router.post("/forgot-password", summary="Gửi mã OTP đặt lại mật khẩu qua email")
async def forgot_password(
    req: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    if not is_email_configured():
        raise HTTPException(status_code=503, detail="Hệ thống chưa cấu hình gửi email. Vui lòng liên hệ quản trị viên.")

    user = await _lock_user_by_email(db, req.email)
    now = datetime.utcnow()
    if user and user.is_active and await _reset_email_allowed(db, user.id, now):
        otp, code_hash = create_password_reset_otp(user.id)
        await _invalidate_reset_otps(db, user.id, now)
        db.add(
            PasswordResetOtp(
                user_id=user.id,
                code_hash=code_hash,
                expires_at=password_reset_otp_expires_at(),
            )
        )
        # Gửi tới email lưu trong DB, không dùng chuỗi người dùng gõ. Gửi nền để thời gian
        # phản hồi và lỗi SMTP không để lộ email nào đã đăng ký.
        background_tasks.add_task(send_password_reset_email, user.email, user.full_name, otp)
    await db.commit()  # Lưu mã trước khi email được gửi (task nền chạy sau response) và nhả khoá.

    return {
        "success": True,
        "message": (
            "Nếu email này đã đăng ký, chúng tôi đã gửi mã xác nhận "
            f"(có hiệu lực {PASSWORD_RESET_OTP_EXPIRE_MINUTES} phút). Vui lòng kiểm tra cả mục Spam."
        ),
        "resend_after_seconds": int(RESET_EMAIL_COOLDOWN.total_seconds()),
    }


async def _check_reset_otp(db: AsyncSession, email: str, otp: str) -> tuple[User, PasswordResetOtp]:
    """Kiểm tra mã OTP; sai thì tính một lượt thử rồi báo 400. Đúng thì vẫn giữ khoá đến khi commit."""
    user = await _lock_user_by_email(db, email)
    now = datetime.utcnow()
    otp_row = None
    if user and user.is_active:
        otp_row = (
            await db.execute(
                select(PasswordResetOtp)
                .where(
                    PasswordResetOtp.user_id == user.id,
                    PasswordResetOtp.used_at.is_(None),
                    PasswordResetOtp.expires_at > now,
                )
                .order_by(PasswordResetOtp.id.desc())
            )
        ).scalars().first()
    if not otp_row:
        raise HTTPException(status_code=400, detail=INVALID_OTP_DETAIL)

    if not password_reset_otp_matches(user.id, otp, otp_row.code_hash):
        # Mã chỉ có 6 số: nhập sai quá số lần thì huỷ mã, không cho đoán tiếp.
        otp_row.failed_attempts += 1
        if otp_row.failed_attempts >= PASSWORD_RESET_OTP_MAX_ATTEMPTS:
            otp_row.used_at = now
        await db.commit()
        raise HTTPException(status_code=400, detail=INVALID_OTP_DETAIL)
    return user, otp_row


@router.post("/verify-reset-otp", summary="Kiểm tra mã OTP trước khi cho nhập mật khẩu mới")
async def verify_reset_otp(req: VerifyResetOtpRequest, db: AsyncSession = Depends(get_db)):
    _, otp_row = await _check_reset_otp(db, req.email, req.otp)
    # Chưa dùng mã: /reset-password kiểm tra lại vì server không tin client đã qua bước này.
    # Gia hạn để mã sắp hết hạn không hỏng giữa lúc người dùng đang nhập mật khẩu.
    otp_row.expires_at = password_reset_otp_expires_at()
    await db.commit()
    return {"success": True}


@router.post("/reset-password", summary="Đặt mật khẩu mới, kèm mã OTP đã kiểm tra ở bước trước")
async def reset_password(req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    user, _ = await _check_reset_otp(db, req.email, req.otp)

    user.hashed_password = hash_password(req.new_password)
    # Mã đã dùng và mọi phiên đăng nhập cũ đều phải mất hiệu lực.
    await _invalidate_reset_otps(db, user.id, datetime.utcnow())
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False))
        .values(revoked=True)
    )
    await db.commit()
    return {"success": True, "message": "Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới."}

# ---------------------------------------------------------------------------
# Danh sách mentor (cho student chọn khi đặt lịch Mock Room)
# ---------------------------------------------------------------------------

@router.get("/mentors", tags=["Auth"], summary="Danh sách mentor để đặt lịch")
async def list_mentors(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User)
        .options(selectinload(User.roles))
        .join(user_roles, User.id == user_roles.c.user_id)
        .join(Role, Role.id == user_roles.c.role_id)
        .where(Role.name == "mentor", User.is_active == 1)
        .order_by(User.full_name)
    )
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
        }
        for u in users
    ]
