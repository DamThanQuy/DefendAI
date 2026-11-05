"""Security utilities: password hashing (bcrypt) + JWT (python-jose) + refresh tokens."""
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import hmac
from secrets import randbelow, token_urlsafe

from fastapi import HTTPException
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expire_minutes
REFRESH_TOKEN_EXPIRE_DAYS = settings.refresh_token_expire_days
PASSWORD_RESET_OTP_EXPIRE_MINUTES = 10
PASSWORD_RESET_OTP_MAX_ATTEMPTS = 5


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: int, role: str = "student") -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "role": role, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_refresh_token(user_id: int) -> str:
    """Tạo refresh token ngẫu nhiên (không phải JWT) — lưu vào DB để có thể revoke."""
    return token_urlsafe(64)


def refresh_token_expires_at() -> datetime:
    return datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)


def hash_password_reset_otp(user_id: int, otp: str) -> str:
    """HMAC với SECRET_KEY: chỉ có 1 triệu mã nên SHA-256 thuần dò ngược được ngay từ DB hoặc log SQL."""
    return hmac.new(settings.secret_key.encode(), f"{user_id}:{otp}".encode(), sha256).hexdigest()


def create_password_reset_otp(user_id: int) -> tuple[str, str]:
    """Tạo (mã 6 số gửi qua email, hash lưu DB)."""
    otp = f"{randbelow(1_000_000):06d}"
    return otp, hash_password_reset_otp(user_id, otp)


def password_reset_otp_matches(user_id: int, otp: str, code_hash: str) -> bool:
    return hmac.compare_digest(hash_password_reset_otp(user_id, otp), code_hash)


def password_reset_otp_expires_at() -> datetime:
    return datetime.utcnow() + timedelta(minutes=PASSWORD_RESET_OTP_EXPIRE_MINUTES)


def decode_access_token(token: str) -> dict:
    """Decode JWT. Raise 401 nếu token invalid hoặc expired."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("sub") is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return payload
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Token error: {e}")
