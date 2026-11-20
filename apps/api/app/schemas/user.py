"""Pydantic schemas cho Auth / User endpoints."""
import re
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

# Danh sách ngành chuẩn (frontend dùng đúng danh sách này — đồng bộ cả 2 phía)
VALID_MAJORS: List[str] = [
    "Công nghệ thông tin / Khoa học máy tính",
    "Kỹ thuật máy tính / Điện tử - Viễn thông",
    "Kỹ thuật điện - Tự động hoá",
    "Kỹ thuật cơ khí - Ô tô",
    "Kỹ thuật xây dựng",
    "Kinh tế / Quản trị kinh doanh",
    "Kế toán - Kiểm toán",
    "Tài chính - Ngân hàng",
    "Ngôn ngữ (Anh/Trung/Nhật/Hàn)",
    "Luật",
    "Y - Dược",
    "Du lịch - Khách sạn",
    "Marketing / Truyền thông",
    "Sư phạm",
    "Khác",
]


def validate_major_value(v: Optional[str]) -> Optional[str]:
    """Chấp nhận None/rỗng (không chọn); giá trị khác phải nằm trong VALID_MAJORS."""
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    if v not in VALID_MAJORS:
        raise ValueError(
            "Ngành học không hợp lệ. Vui lòng chọn một ngành trong danh sách được hỗ trợ."
        )
    return v


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=5, examples=["user@example.com"])
    password: str = Field(..., min_length=6)
    full_name: Optional[str] = None
    major: Optional[str] = None

    @field_validator("major")
    @classmethod
    def validate_major(cls, v: Optional[str]) -> Optional[str]:
        return validate_major_value(v)


class LoginRequest(BaseModel):
    email: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class VerifyResetOtpRequest(ForgotPasswordRequest):
    otp: str = Field(..., max_length=32)

    @field_validator("otp")
    @classmethod
    def validate_otp(cls, v: str) -> str:
        # Mã dán từ email có thể dính dấu cách.
        v = re.sub(r"\s", "", v)
        if not re.fullmatch(r"[0-9]{6}", v):
            raise ValueError("Mã xác nhận phải gồm 6 chữ số.")
        return v


class ResetPasswordRequest(VerifyResetOtpRequest):
    new_password: str = Field(..., max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        # Cùng quy tắc với form đăng ký ở frontend (apps/web/src/lib/auth-form.ts).
        if len(v) < 8 or not all(re.search(p, v) for p in (r"[A-Z]", r"[a-z]", r"[0-9]", r"[^A-Za-z0-9]")):
            raise ValueError(
                "Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký hiệu đặc biệt."
            )
        return v


class GoogleLoginRequest(BaseModel):
    """Google ID token từ frontend (Google Sign-In)."""
    id_token: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    is_active: bool
    roles: List[str] = []
    profile_data: dict = {}
    major: Optional[str] = None

    @classmethod
    def from_user(cls, user) -> "UserResponse":
        return cls(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            is_active=bool(user.is_active),
            roles=[r.name for r in user.roles],
            profile_data=user.profile_data or {},
            major=getattr(user, "major", None),
        )


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(None, max_length=255)
    # Optional + None = "không đổi": onboarding chỉ gửi major, không được xoá sạch profile_data cũ.
    profile_data: Optional[dict] = None
    major: Optional[str] = None

    @field_validator("major")
    @classmethod
    def validate_major(cls, v: Optional[str]) -> Optional[str]:
        return validate_major_value(v)
class UpdateMeRequest(BaseModel):
    full_name: Optional[str] = None
    avatar: Optional[str] = None
    wallpaper: Optional[str] = None
    school: Optional[str] = None
    about: Optional[str] = None



class AuthResponse(BaseModel):
    success: bool
    token: str
    refresh_token: Optional[str] = None
    user: UserResponse
