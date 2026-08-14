"""Model Rubric — tiêu chí chuẩn có cấu trúc (thước đo cho AI)."""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class Rubric(Base):
    """Tiêu chí chuẩn (rubric) dùng làm thước đo cho AI.

    Thay thế prompt hardcode: code review đọc scope='code_review', sinh câu hỏi
    đọc scope='defense'. `config` (JSONB) lưu cấu trúc tiêu chí theo scope, admin
    sửa qua UI mà không cần migration. `is_active` cho phép đổi rubric kỳ mới
    không xoá cũ; `version` trace vào mỗi analysis.
    """

    __tablename__ = "rubrics"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    key = Column(String(40), nullable=False, unique=True, index=True)
    name = Column(String(120), nullable=False)
    scope = Column(String(20), nullable=False, index=True)
    version = Column(String(20), nullable=False, default="1.0")
    is_active = Column(Boolean, nullable=False, default=True)
    config = Column(JSONB, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
