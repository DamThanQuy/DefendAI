from datetime import datetime
from enum import Enum

from sqlalchemy import Column, Integer, String, Text, DateTime, Enum as SQLEnum, JSON, ForeignKey
from sqlalchemy.orm import relationship

from app.core.database import Base


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


class CodeAnalysisStatus(str, Enum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class CodeAnalysis(Base):
    __tablename__ = "code_analyses"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    # Backward-compatible fields (single-shot legacy path)
    issues = Column(JSON, nullable=True)
    summary = Column(Text, nullable=True)
    pass_rate = Column(Integer, nullable=True)
    # New fields for async map-reduce pipeline (100k files)
    status = Column(SQLEnum(CodeAnalysisStatus), default=CodeAnalysisStatus.queued, nullable=False)
    provider = Column(String(50), nullable=True)
    model = Column(String(50), nullable=True)
    total_files = Column(Integer, nullable=True)
    total_modules = Column(Integer, default=0, nullable=False)
    done_modules = Column(Integer, default=0, nullable=False)
    stats_json = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    document = relationship("Document", back_populates="code_analyses")


class CodeAnalysisIssue(Base):
    """One row per detected issue, written incrementally by module workers."""

    __tablename__ = "code_analysis_issues"

    id = Column(Integer, primary_key=True, index=True)
    analysis_id = Column(Integer, ForeignKey("code_analyses.id"), nullable=False, index=True)
    module = Column(String(255), nullable=True)
    file = Column(Text, nullable=False)
    line = Column(Integer, nullable=False)
    type = Column(String(50), nullable=True)
    severity = Column(String(20), nullable=False, index=True)
    description = Column(Text, nullable=True)
    suggestion = Column(Text, nullable=True)


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
