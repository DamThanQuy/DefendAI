"""Workspace Question — kết quả "Hỏi theo đề tài" (R6, RAG toàn-workspace).

Một row = một lần user hỏi đề tài cho workspace → questions sinh bởi RAG
(retrieve top-K chunks + AI), mỗi câu kèm citations trỏ `file:đoạn`.

Tách bảng riêng (không dùng Assessment) vì Assessment gắn theo từng document,
còn đây gắn theo workspace + topic — 2 vòng đời khác nhau.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy import Enum as SQLEnum

from app.core.database import Base
from app.models.assessment import AssessmentStatus


class WorkspaceQuestion(Base):
    __tablename__ = "workspace_questions"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, index=True)
    topic = Column(Text, nullable=False)
    persona = Column(String(50), nullable=False, default="theory")
    questions = Column(JSON, nullable=True)  # [{id, question, suggested_answer, difficulty, persona, citations:[file:đoạn]}]
    sources = Column(JSON, nullable=True)  # [{num, source:"user"|"ref", title, chunk_index, content}] — nguồn đã dùng
    status = Column(SQLEnum(AssessmentStatus), default=AssessmentStatus.pending, nullable=False)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
