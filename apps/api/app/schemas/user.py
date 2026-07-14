"""Pydantic schemas cho Auth / User endpoints."""
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


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    is_active: bool
    roles: List[str] = []

    @classmethod
    def from_user(cls, user) -> "UserResponse":
        return cls(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            is_active=bool(user.is_active),
            roles=[r.name for r in user.roles],
        )


class AuthResponse(BaseModel):
    success: bool
    token: str
    user: UserResponse
