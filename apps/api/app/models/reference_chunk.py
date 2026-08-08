from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from pgvector.sqlalchemy import Vector

from app.core.database import Base
from app.services.embedder import EMBEDDING_DIM


class ReferenceChunk(Base):
    """Chunk từ Reference Knowledge Base (sách giáo khoa, rubric, đề mẫu điểm cao).

    Dữ liệu tĩnh, index một lần, dùng chung cho mọi user. Retriever RAG lấy
    4 chunk reference + 8 chunk từ tài liệu của user để trả lời câu hỏi.

    `category`: loại nguồn (textbook | rubric | sample_project | spec).
    `embedding`: vector(EMBEDDING_DIM) cùng model với DocumentChunk (Gemini).
    """

    __tablename__ = "reference_chunks"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    category = Column(String(20), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(EMBEDDING_DIM), nullable=True)
    meta = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
