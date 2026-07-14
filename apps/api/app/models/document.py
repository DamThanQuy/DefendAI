from datetime import datetime
from enum import Enum

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum as SQLEnum
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


class DocumentPurpose(str, Enum):
    student_project = "student_project"
    staff_reference = "staff_reference"


class Document(Base):
    """Model cho tài liệu được upload lên hệ thống"""
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False)  # extension: .pdf, .docx, ...
    doc_type = Column(SQLEnum(DocType), nullable=False)
    status = Column(SQLEnum(DocumentStatus), default=DocumentStatus.uploaded, nullable=False)
    storage_key = Column(String(256), nullable=False)
    content_hash = Column(String(64), nullable=True)
    purpose = Column(SQLEnum(DocumentPurpose), default=DocumentPurpose.student_project, nullable=False)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    assessments = relationship("Assessment", back_populates="document", cascade="all, delete-orphan")
    code_analyses = relationship("CodeAnalysis", back_populates="document", cascade="all, delete-orphan")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")
