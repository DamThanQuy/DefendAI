from datetime import datetime
from enum import Enum

from sqlalchemy import Column, Integer, String, Text, DateTime, Enum as SQLEnum, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from app.core.database import Base


class AssessmentStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    chunks = Column(JSON, nullable=True)
    questions = Column(JSON, nullable=True)
    status = Column(SQLEnum(AssessmentStatus), default=AssessmentStatus.pending, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    document = relationship("Document", back_populates="assessments")


class CodeAnalysisStatus(str, Enum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class CodeAnalysis(Base):
    __tablename__ = "code_analyses"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    # Backward-compatible fields (single-shot legacy path)
    issues = Column(JSON, nullable=True)
    summary = Column(Text, nullable=True)
    # New fields for async map-reduce pipeline (100k files)
    status = Column(SQLEnum(CodeAnalysisStatus), default=CodeAnalysisStatus.queued, nullable=False)
    provider = Column(String(50), nullable=True)
    model = Column(String(50), nullable=True)
    total_files = Column(Integer, nullable=True)
    total_modules = Column(Integer, default=0, nullable=False)
    done_modules = Column(Integer, default=0, nullable=False)
    stats_json = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    document = relationship("Document", back_populates="code_analyses")


class CodeAnalysisIssue(Base):
    """One row per detected issue, written incrementally by module workers."""

    __tablename__ = "code_analysis_issues"

    id = Column(Integer, primary_key=True, index=True)
    analysis_id = Column(Integer, ForeignKey("code_analyses.id"), nullable=False, index=True)
    module = Column(String(255), nullable=True)
    file = Column(Text, nullable=False)
    line = Column(Integer, nullable=False)
    type = Column(String(50), nullable=True)
    severity = Column(String(20), nullable=False, index=True)
    description = Column(Text, nullable=True)
    suggestion = Column(Text, nullable=True)


class Evaluation(Base):
    __tablename__ = "evaluations"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=False, index=True)
    reviewer_name = Column(String(100), nullable=False)
    scores = Column(JSON, nullable=False)
    radar_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    meeting = relationship("Meeting", back_populates="evaluations")
    report = relationship("Report", back_populates="evaluation", cascade="all, delete-orphan")


class Report(Base):
    """Báo cáo cho sinh viên sau 1 buổi bảo vệ thử.

    Chủ sở hữu / đồ án đi theo meeting (evaluation → meeting.student_id /
    workspace_id). Phần AI chỉ là nhận xét định tính theo rubric — điểm số
    OGA/TDA lấy từ defense_scores, không lưu ở đây.
    """

    __tablename__ = "reports"
    __table_args__ = (
        # 1 phiên Mock AI = 1 báo cáo (kết thúc lại → cập nhật, không tạo trùng)
        UniqueConstraint("mock_session_id", name="uq_reports_mock_session_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    evaluation_id = Column(Integer, ForeignKey("evaluations.id"), nullable=False, index=True)
    # Nhận xét tổng quan của AI
    ai_feedback = Column(Text, nullable=True)
    weaknesses = Column(JSON, nullable=True)
    pdf_path = Column(String(512), nullable=True)
    pass_rate = Column(Integer, nullable=True)
    # ai_mock (phòng Mock AI) | mentor_mock (phòng mock với mentor)
    source = Column(String(20), nullable=False, default="ai_mock", server_default="ai_mock")
    # Trạng thái AI tổng hợp nhận xét: pending | ready | failed
    generation_status = Column(String(20), nullable=False, default="ready", server_default="ready")
    generation_error = Column(Text, nullable=True)
    mock_session_id = Column(
        Integer, ForeignKey("mock_chat_sessions.id", ondelete="SET NULL"), nullable=True
    )
    # Tài liệu làm ngữ cảnh khi chốt báo cáo (snapshot từ phiên chat)
    document_id = Column(Integer, nullable=True)
    # [{key, level, comment, evidence}] — key/level theo rubric.quality_criteria
    quality_criteria = Column(JSON, nullable=True)
    strengths = Column(JSON, nullable=True)
    action_items = Column(JSON, nullable=True)
    # [{clo, covered, comment}] — CLO nào đã được chất vấn trong buổi
    clo_breakdown = Column(JSON, nullable=True)
    # Snapshot hội thoại đã đánh giá: [{role: student|examiner, content, time}]
    transcript = Column(JSON, nullable=True)
    rubric_version = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    evaluation = relationship("Evaluation", back_populates="report")
