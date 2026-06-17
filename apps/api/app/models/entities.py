"""
Re-export all models for backward compatibility.

Code cũ dùng `from app.models.entities import X` vẫn hoạt động.
Code mới nên import trực tiếp từ module con:
    from app.models.user import User
    from app.models.document import Document, DocType, DocumentStatus
    from app.models.meeting import Meeting, MeetingMember, MeetingStatus, MemberRole
    from app.models.assessment import Assessment, CodeAnalysis, Evaluation, Report, AssessmentStatus
"""
from app.models.user import User
from app.models.document import Document, DocType, DocumentStatus
from app.models.meeting import Meeting, MeetingMember, MeetingStatus, MemberRole
from app.models.assessment import (
    Assessment,
    AssessmentStatus,
    CodeAnalysis,
    Evaluation,
    Report,
)

__all__ = [
    "User",
    "Document",
    "DocType",
    "DocumentStatus",
    "Meeting",
    "MeetingMember",
    "MeetingStatus",
    "MemberRole",
    "Assessment",
    "AssessmentStatus",
    "CodeAnalysis",
    "Evaluation",
    "Report",
]
