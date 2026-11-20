"""Mã OTP đặt lại mật khẩu — chỉ lưu HMAC, mã thật chỉ nằm trong email."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from app.core.database import Base

class PasswordResetOtp(Base):
    __tablename__ = "password_reset_otps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    code_hash = Column(String(64), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    failed_attempts = Column(Integer, default=0, nullable=False)
    # Có giá trị = đã dùng, nhập sai quá số lần hoặc đã bị mã mới thay thế → hết hiệu lực.
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
