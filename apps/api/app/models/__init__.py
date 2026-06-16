"""
Register tất cả models với SQLAlchemy Base.

IMPORT顺序 QUAN TRỌNG: phải import tất cả model trước khi tạo engine.
"""
from app.core.database import Base  # noqa: F401

from app.models.user import User  # noqa: F401
from app.models.document import Document, DocType, DocumentStatus  # noqa: F401
from app.models.meeting import Meeting, MeetingMember, MeetingStatus, MemberRole  # noqa: F401
from app.models.assessment import (  # noqa: F401
    Assessment,
    AssessmentStatus,
    CodeAnalysis,
    Evaluation,
    Report,
)

# Import Session (giữ nguyên)
from app.models.session import Session  # noqa: F401

__all__ = [
    "User",
    "Document",
    "DocType",
    "DocumentStatus",
    "Assessment",
    "AssessmentStatus",
    "CodeAnalysis",
    "Meeting",
    "MeetingMember",
    "MeetingStatus",
    "MemberRole",
    "Evaluation",
    "Report",
    "Session",
]
