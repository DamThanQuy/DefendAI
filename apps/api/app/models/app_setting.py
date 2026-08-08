"""AppSetting — cấu hình hệ thống lưu DB (admin chỉnh qua UI)."""
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.core.database import Base


class AppSetting(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(Text, nullable=True)
    description = Column(String(255), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)