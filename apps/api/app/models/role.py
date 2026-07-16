from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.association import user_roles


class Role(Base):
    """Vai trò người dùng (student / admin / mentor).

    Thiết kế mở rộng: thêm role mới = INSERT 1 row (không cần migration).
    1 user có thể có nhiều roles qua bảng trung gian user_roles.
    """

    __tablename__ = "roles"

    id = Column(Integer, primary_key=True)
    name = Column(String(50), unique=True, nullable=False)  # student | admin | mentor
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    users = relationship("User", secondary=user_roles, back_populates="roles")
