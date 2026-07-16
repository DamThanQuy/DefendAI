from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.association import user_roles


class User(Base):
    """Model cho người dùng trong hệ thống"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=True)
    full_name = Column(String(255), nullable=True)
    is_active = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Auth: email (mật khẩu) hoặc google (OAuth)
    auth_provider = Column(String(20), default="email", nullable=False)
    # Google subject ID (chỉ khi auth_provider = google)
    google_sub = Column(String(255), nullable=True)

    sessions = relationship("Session", back_populates="creator", foreign_keys="Session.created_by")
    roles = relationship("Role", secondary=user_roles, back_populates="users")
