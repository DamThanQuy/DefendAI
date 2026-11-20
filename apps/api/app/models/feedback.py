from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class Feedback(Base):
    """Model lưu trữ phản hồi của người dùng (Feedback & Product Analytics)."""

    __tablename__ = "feedbacks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    current_plan = Column(String(50), nullable=False, default="free")
    overall_rating = Column(Integer, nullable=False)
    aspect_ratings = Column(JSON, nullable=True, default=dict)
    detected_features = Column(JSON, nullable=True, default=list)
    feature_ratings = Column(JSON, nullable=True, default=dict)
    low_rating_reasons = Column(JSON, nullable=True, default=list)
    best_thing = Column(Text, nullable=True)
    suggested_change = Column(Text, nullable=True)
    will_recommend = Column(Integer, nullable=True)
    pay_willingness = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    user = relationship("User", back_populates="feedbacks")
