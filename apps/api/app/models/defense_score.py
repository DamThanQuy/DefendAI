"""DefenseScore — điểm chấm chi tiết per (giám khảo, nhóm rubric, hạng mục).

BR-A1: rubric DB-driven — `item_code` tham chiếu `grading.{oga|tda}.items` trong
rubric config (key='defense_sep490'), không hard-code tiêu chí.

Mọi ghi điểm logged (audit_defense_scores) — cam kết REQUIREMENT §4.2.
"""
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class DefenseScore(Base):
    __tablename__ = "defense_scores"
    __table_args__ = (
        UniqueConstraint(
            "meeting_id",
            "reviewer_id",
            "group",
            "item_code",
            name="uq_defense_score_reviewer_item",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=False, index=True)
    # Giám khảo: user thật (mentor/admin) — NULL nếu điểm do AI mock sinh ra.
    reviewer_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    reviewer_name = Column(String(100), nullable=False)
    is_ai = Column(Boolean, nullable=False, default=False)
    # 'OGA' | 'TDA' — nhóm rubric
    group = Column(String(10), nullable=False, index=True)
    # Mã hạng mục khớp rubric config: introduction|pmp|srs|sdd|testing|
    # user_guides|implementation|presentation|qa
    item_code = Column(String(40), nullable=False)
    # Mark trên thang rubric (0–10, 1 chữ số thập phân)
    mark = Column(Numeric(3, 1), nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    meeting = relationship("Meeting", back_populates="defense_scores")


class DefenseScoreAudit(Base):
    """Log bất biến mọi thay đổi điểm (insert/update/delete)."""

    __tablename__ = "audit_defense_scores"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    score_id = Column(Integer, nullable=False, index=True)
    action = Column(String(10), nullable=False)  # insert | update | delete
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    before = Column(Text, nullable=True)  # JSON snapshot
    after = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
