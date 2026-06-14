# Import tất cả models để đảm bảo chúng được register với SQLAlchemy Base
from app.core.database import Base

# Import models từ entities.py (đã có đầy đủ: User, Document, Assessment, CodeAnalysis,
# Meeting, MeetingMember, Evaluation, Report)
from app.models.entities import (
    User,
    Document,
    Assessment,
    CodeAnalysis,
    Meeting,
    MeetingMember,
    Evaluation,
    Report,
)

# Import Session từ session.py
from app.models.session import Session

# Export tất cả models
__all__ = [
    "User",
    "Document",
    "Assessment",
    "CodeAnalysis",
    "Meeting",
    "MeetingMember",
    "Evaluation",
    "Report",
    "Session",
]