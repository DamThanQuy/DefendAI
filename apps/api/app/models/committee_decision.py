"""CommitteeDecision — log bất biến quyết định hội đồng về rule (BR-B1).

Hội đồng tick confirm/reject cho mỗi rule trong bảng rule check.
Mọi tick đều logged với reviewer_id + timestamp + comment.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class CommitteeDecision(Base):
    __tablename__ = "committee_decisions"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=False, index=True)
    reviewer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    reviewer_name = Column(String(100), nullable=False)
    rule_id = Column(String(40), nullable=False, index=True)
    decision = Column(String(20), nullable=False)  # confirm | reject
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    meeting = relationship("Meeting", back_populates="committee_decisions")
