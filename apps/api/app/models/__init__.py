"""
Register tất cả models với SQLAlchemy Base.

IMPORT顺序 QUAN TRỌNG: phải import tất cả model trước khi tạo engine.
"""
from app.core.database import Base  # noqa: F401

from app.models.user import User  # noqa: F401
from app.models.role import Role  # noqa: F401
from app.models.refresh_token import RefreshToken  # noqa: F401
from app.models.association import user_roles  # noqa: F401
from app.models.document import Document, DocType, DocumentStatus  # noqa: F401
from app.models.document_chunk import DocumentChunk  # noqa: F401
from app.models.reference_chunk import ReferenceChunk  # noqa: F401
from app.models.meeting import Meeting, MeetingMember, MeetingStatus, MemberRole  # noqa: F401
from app.models.booking import MockBooking, BookingStatus  # noqa: F401
from app.models.assessment import (  # noqa: F401
    Assessment,
    AssessmentStatus,
    CodeAnalysis,
    Evaluation,
    Report,
)
from app.models.app_setting import AppSetting  # noqa: F401
from app.models.session import Session  # noqa: F401
from app.models.workspace import Workspace  # noqa: F401
from app.models.workspace_question import WorkspaceQuestion  # noqa: F401
from app.models.workspace_chat import WorkspaceChat  # noqa: F401

__all__ = [
    "User",
    "Role",
    "RefreshToken",
    "user_roles",
    "Document",
    "DocType",
    "DocumentStatus",
    "DocumentChunk",
    "ReferenceChunk",
    "Meeting",
    "MeetingMember",
    "MeetingStatus",
    "MemberRole",
    "MockBooking",
    "BookingStatus",
    "Assessment",
    "AssessmentStatus",
    "CodeAnalysis",
    "Evaluation",
    "Report",
    "AppSetting",
    "Session",
    "Workspace",
    "WorkspaceQuestion",
    "WorkspaceChat",
]
