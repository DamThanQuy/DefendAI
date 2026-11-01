"""Pydantic schemas cho Auth / User endpoints."""
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


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=5, examples=["user@example.com"])
    password: str = Field(..., min_length=6)
    full_name: Optional[str] = None
    major: Optional[str] = None

    @field_validator("major")
    @classmethod
    def validate_major(cls, v: Optional[str]) -> Optional[str]:
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


class LoginRequest(BaseModel):
    email: str
    password: str


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
    profile_data: dict = Field(default_factory=dict)
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
