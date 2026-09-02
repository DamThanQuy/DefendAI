"""UseCaseCommitment — cam kết UC từ SRS + đếm completed (BR-B2).

Mỗi dòng là 1 UC SV cam kết (trong Report 3 SRS) hoặc bổ sung thủ công.
`status`:
  - committed   : AI trích từ SRS (hoặc SV tự khai báo), chưa chứng minh hoàn thành
  - completed   : SV đã demo được UC này (tick thủ công qua API)
  - omitted     : SV cam kết nhưng quyết định bỏ (có lý do, audit)

Mọi thay đổi (insert/update/delete) ghi vào UseCaseCommitmentAudit
(cam kết REQUIREMENT §4.2 — mọi thay đổi phải logged).
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class UCStatus(str, Enum):
    committed = "committed"
    completed = "completed"
    omitted = "omitted"


class UCSource(str, Enum):
    ai_extracted = "ai_extracted"   # AI trích từ file SRS
    manual = "manual"               # SV tự nhập hoặc sửa


class UseCaseCommitment(Base):
    __tablename__ = "use_case_commitments"
    __table_args__ = (
        # 1 workspace không thể có 2 UC trùng mã (case-insensitive sẽ check ở service)
        UniqueConstraint(
            "workspace_id", "uc_code", name="uq_uc_commitment_workspace_code"
        ),
        Index("ix_uc_commitment_workspace_status", "workspace_id", "status"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, index=True)
    # Mã UC: "UC01", "UC-Login", ... (case-insensitive lookup ở service)
    uc_code = Column(String(40), nullable=False)
    name = Column(String(255), nullable=False)
    actor = Column(String(100), nullable=True)
    # Trạng thái: committed | completed | omitted
    status = Column(
        String(20), nullable=False, default=UCStatus.committed.value, index=True
    )
    # Ước lượng độ lớn UC (3–7 transactions theo Student Guide)
    transactions_est = Column(Integer, nullable=True)
    # Nguồn: ai_extracted | manual
    source = Column(String(20), nullable=False, default=UCSource.ai_extracted.value)
    # Document gốc (nếu extract từ SRS upload) — null nếu SV tự nhập
    source_document_id = Column(
        Integer, ForeignKey("documents.id"), nullable=True, index=True
    )
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    workspace = relationship("Workspace")
    source_document = relationship("Document")


class UseCaseCommitmentAudit(Base):
    """Log bất biến mọi thay đổi UC (insert/update/delete)."""

    __tablename__ = "audit_use_case_commitments"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    commitment_id = Column(Integer, nullable=False, index=True)
    action = Column(String(10), nullable=False)  # insert | update | delete
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    before = Column(Text, nullable=True)  # JSON snapshot
    after = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
