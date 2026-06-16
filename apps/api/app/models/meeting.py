from datetime import datetime
from enum import Enum

from sqlalchemy import Column, Integer, String, DateTime, Enum as SQLEnum, ForeignKey
from sqlalchemy.orm import relationship

from app.core.database import Base


class MeetingStatus(str, Enum):
    scheduled = "scheduled"
    active = "active"
    ended = "ended"


class MemberRole(str, Enum):
    chairperson = "chairperson"
    secretary = "secretary"
    reviewer = "reviewer"
    student = "student"


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    status = Column(SQLEnum(MeetingStatus), default=MeetingStatus.scheduled, nullable=False)
    phase = Column(String(50), nullable=False, server_default="presentation")
    timer_seconds = Column(Integer, nullable=False, server_default="900")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    members = relationship("MeetingMember", back_populates="meeting", cascade="all, delete-orphan")
    evaluations = relationship("Evaluation", back_populates="meeting", cascade="all, delete-orphan")


class MeetingMember(Base):
    __tablename__ = "meeting_members"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    role = Column(SQLEnum(MemberRole), nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    meeting = relationship("Meeting", back_populates="members")
