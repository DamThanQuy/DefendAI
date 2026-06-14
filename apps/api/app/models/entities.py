from datetime import datetime
from enum import Enum

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    Enum as SQLEnum,
    JSON,
    ForeignKey,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class User(Base):
    """Model cho người dùng trong hệ thống"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    is_active = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    sessions = relationship("Session", back_populates="creator", foreign_keys="Session.created_by")


class DocType(str, Enum):
    PDF = "pdf"
    DOCX = "docx"
    PPTX = "pptx"
    ZIP = "zip"


class DocumentStatus(str, Enum):
    uploaded = "uploaded"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class Document(Base):
    """Model cho tài liệu được upload lên hệ thống"""
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    doc_type = Column(SQLEnum(DocType), nullable=False)
    status = Column(SQLEnum(DocumentStatus), default=DocumentStatus.uploaded, nullable=False)
    file_path = Column(String(512), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    assessments = relationship("Assessment", back_populates="document", cascade="all, delete-orphan")
    code_analyses = relationship("CodeAnalysis", back_populates="document", cascade="all, delete-orphan")


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


class Evaluation(Base):
    __tablename__ = "evaluations"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=False, index=True)
    reviewer_name = Column(String(100), nullable=False)
    scores = Column(JSON, nullable=False)
    radar_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    meeting = relationship("Meeting", back_populates="evaluations")
    report = relationship("Report", back_populates="evaluation", cascade="all, delete-orphan")


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    evaluation_id = Column(Integer, ForeignKey("evaluations.id"), nullable=False, index=True)
    ai_feedback = Column(Text, nullable=True)
    weaknesses = Column(JSON, nullable=True)
    pdf_path = Column(String(512), nullable=True)
    pass_rate = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    evaluation = relationship("Evaluation", back_populates="report")


class AssessmentStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    persona = Column(String(50), nullable=False)
    chunks = Column(JSON, nullable=True)
    questions = Column(JSON, nullable=True)
    status = Column(SQLEnum(AssessmentStatus), default=AssessmentStatus.pending, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    document = relationship("Document", back_populates="assessments")


class CodeAnalysis(Base):
    __tablename__ = "code_analyses"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    issues = Column(JSON, nullable=True)
    summary = Column(Text, nullable=True)
    pass_rate = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    document = relationship("Document", back_populates="code_analyses")
