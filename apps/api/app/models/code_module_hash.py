"""Cache hash nội dung module để skip LLM khi re-scan cùng nội dung.

Đề xuất 1 từ NotebookLM: băm SHA256 tổng hợp path + content của từng module.
Khi user upload lại ZIP đã từng scan, các module có hash trùng sẽ clone
issue cũ sang analysis mới, bỏ qua LLM call → tiết kiệm ~80% cost.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, JSON, Index, ForeignKey
from sqlalchemy.orm import relationship

from app.core.database import Base


class CodeModuleHash(Base):
    __tablename__ = "code_module_hashes"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    module = Column(String(255), nullable=False)
    content_hash = Column(String(64), nullable=False, index=True)  # SHA256 hex
    issue_ids_json = Column(JSON, nullable=True)  # [issue_id, ...] để clone
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    document = relationship("Document", back_populates="code_module_hashes")

    __table_args__ = (
        Index("ix_doc_module_hash", "document_id", "module"),
    )