"""Workspace models — gom nhiều file thành 1 đề tài.

Nguyên tắc: Workspace chỉ TRỎ tới file trong thùng documents — không copy file.
Thêm file vào workspace = thêm 1 dòng workspace_files, không phồng dữ liệu.
"""
from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from app.core.database import Base


class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    files = relationship(
        "WorkspaceFile",
        back_populates="workspace",
        cascade="all, delete-orphan",
    )
    
    # Messages (ChatGPT-style)
    messages = relationship(
        "Message",
        back_populates="workspace",
        cascade="all, delete-orphan",
    )


class WorkspaceFile(Base):
    __tablename__ = "workspace_files"
    __table_args__ = (
        # 1 workspace + 1 file chỉ xuất hiện 1 lần
        UniqueConstraint("workspace_id", "document_id", name="uq_workspace_document"),
    )

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    role = Column(String(20), default="main", nullable=False)  # main / attachment
    added_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    workspace = relationship("Workspace", back_populates="files")
    document = relationship("Document")
