"""Pydantic schemas cho Auth / User endpoints."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=5, examples=["user@example.com"])
    password: str = Field(..., min_length=6)
    full_name: Optional[str] = None


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
    school: Optional[str] = None
    about: Optional[str] = None
    created_at: Optional[datetime] = None
    is_active: bool
    roles: List[str] = []

    @classmethod
    def from_user(cls, user) -> "UserResponse":
        return cls(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            school=getattr(user, "school", None),
            about=getattr(user, "about", None),
            created_at=user.created_at,
            is_active=bool(user.is_active),
            roles=[r.name for r in user.roles],
        )


class UpdateMeRequest(BaseModel):
    """Cập nhật hồ sơ cá nhân — chỉ các field được gửi lên (exclude_unset)."""
    full_name: Optional[str] = Field(None, max_length=255)
    school: Optional[str] = Field(None, max_length=255)
    about: Optional[str] = Field(None, max_length=500)


class AuthResponse(BaseModel):
    success: bool
    token: str
    refresh_token: Optional[str] = None
    user: UserResponse
