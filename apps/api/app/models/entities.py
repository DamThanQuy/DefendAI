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


class AssessmentStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    file_type = Column(String(50), nullable=False)
    doc_type = Column(SQLEnum(DocType), nullable=False)
    content_hash = Column(String(64), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    assessments = relationship("Assessment", back_populates="document", cascade="all, delete-orphan")
    code_analyses = relationship("CodeAnalysis", back_populates="document", cascade="all, delete-orphan")


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
