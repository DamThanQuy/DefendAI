"""
Re-export all models for backward compatibility.

Code cũ dùng `from app.models.entities import X` vẫn hoạt động.
Code mới nên import trực tiếp từ module con:
    from app.models.user import User
    from app.models.document import Document, DocType, DocumentStatus, DocumentPurpose
    from app.models.meeting import Meeting, MeetingMember, MeetingStatus, MemberRole
    from app.models.assessment import Assessment, CodeAnalysis, Evaluation, Report, AssessmentStatus
"""
from app.models.user import User
from app.models.role import Role
from app.models.document import Document, DocType, DocumentStatus, DocumentPurpose
from app.models.document_chunk import DocumentChunk
from app.models.reference_chunk import ReferenceChunk
from app.models.meeting import Meeting, MeetingMember, MeetingStatus, MemberRole
from app.models.assessment import (
    Assessment,
    AssessmentStatus,
    CodeAnalysis,
    CodeAnalysisIssue,
    CodeAnalysisStatus,
    Evaluation,
    Report,
)

from app.models.refresh_token import RefreshToken
from app.models.workspace import Workspace, WorkspaceFile
from app.models.workspace_chat import WorkspaceChat
from app.models.workspace_question import WorkspaceQuestion

__all__ = [
    "User",
    "Role",
    "Document",
    "DocType",
    "DocumentStatus",
    "DocumentPurpose",
    "Meeting",
    "MeetingMember",
    "MeetingStatus",
    "MemberRole",
    "Assessment",
    "AssessmentStatus",
    "CodeAnalysis",
    "CodeAnalysisIssue",
    "CodeAnalysisStatus",
    "Evaluation",
    "Report",
    "DocumentChunk", "RefreshToken",
    "ReferenceChunk",
    "Workspace", "WorkspaceFile",
    "WorkspaceChat",
    "WorkspaceQuestion",
]
