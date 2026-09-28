"""Defect severity classification (BR-B3).

Enum mới `show_stopper | logic | minor` dùng cho rule BR-B1 R-DELAY-3.
Đây là tầng service: source-of-truth vẫn là cột `severity` (String(20)) trong
`code_analysis_issues` — enum mới được map từ giá trị legacy của code_scanner.

Audit cho mọi thay đổi severity (override bởi mentor) ghi vào
`audit_code_analysis_issues` (không đụng schema `code_analysis_issues`).
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class DefectSeverity(str, Enum):
    """3 mức nghiêm trọng phục vụ rule BR-B1 R-DELAY-3.

    Mapping từ severity legacy (code_scanner):
      - critical / high  → show_stopper
      - medium           → logic
      - low / info       → minor
    """
    show_stopper = "show_stopper"  # Chặn end-user hoàn thành UC chính
    logic = "logic"                # Sai nghiệp vụ rõ ràng
    minor = "minor"                # Convention, code smell, UI phụ


# Map legacy severity → DefectSeverity mới (lowercase, dùng cho query DB)
_LEGACY_TO_NEW: dict[str, DefectSeverity] = {
    "critical": DefectSeverity.show_stopper,
    "high": DefectSeverity.show_stopper,
    "medium": DefectSeverity.logic,
    "low": DefectSeverity.minor,
    "info": DefectSeverity.minor,
}


def map_legacy_severity(legacy: str | None) -> DefectSeverity | None:
    """Map 1 giá trị severity legacy từ `code_analysis_issues.severity`
    sang DefectSeverity mới.

    Trả None nếu không nhận diện được (giúp caller fallback).
    """
    if not legacy:
        return None
    return _LEGACY_TO_NEW.get(legacy.strip().lower())


class AuditCodeAnalysisIssue(Base):
    """Bất biến: mọi thay đổi severity bởi mentor ghi vào đây.

    Cam kết §4.2: mọi thay đổi trạng thái phải logged.
    """

    __tablename__ = "audit_code_analysis_issues"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    issue_id = Column(Integer, nullable=False, index=True)
    action = Column(String(10), nullable=False)  # update (chỉ severity được phép đổi)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    before = Column(Text, nullable=True)  # JSON snapshot
    after = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
