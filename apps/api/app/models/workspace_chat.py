"""WorkspaceChat — 1 lượt hội thoại chat theo đề tài (R7, RAG multi-turn).

Một row = một lượt: user hỏi (question) → AI trả lời (answer) kèm citations
trỏ `file:đoạn`. Lịch sử đa-turn = các row completed gần nhất cùng workspace.

Tách bảng riêng khỏi workspace_questions (R6): R6 = 1 đề tài → 10 câu hỏi,
R7 = hỏi-đáp liên tục. 2 bảng, 2 tab UI, không lẫn lộn.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy import Enum as SQLEnum

from app.core.database import Base
from app.models.assessment import AssessmentStatus


class WorkspaceChat(Base):
    __tablename__ = "workspace_chats"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, index=True)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=True)
    citations = Column(JSON, nullable=True)  # ["Nhom5_.pdf: đoạn 1.2"]
    persona = Column(String(50), nullable=False, default="theory")
    status = Column(SQLEnum(AssessmentStatus), default=AssessmentStatus.pending, nullable=False)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
