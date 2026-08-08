from datetime import datetime

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector

from app.core.database import Base
from app.services.embedder import EMBEDDING_DIM


class DocumentChunk(Base):
    """Bể chứa chunk text + embedding + metadata — nguồn retrieve cho RAG.

    Mỗi chunk là một đoạn text đã tách từ document upload, dùng làm input
    cho retriever và làm căn cứ (provenance) cho citation gắn vào từng câu
    trả lời trong `assessments.questions`.

    `embedding` là vector(EMBEDDING_DIM) từ pgvector (model Gemini qua local endpoint).
    `meta` là JSONB chứa { doc_type, filename, chunk_index }.
    """

    __tablename__ = "document_chunks"

    id = Column(BigInteger, primary_key=True, autoincrement=True, index=True)
    document_id = Column(
        Integer, ForeignKey("documents.id"), nullable=False, index=True
    )
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(EMBEDDING_DIM), nullable=True)
    meta = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    document = relationship("Document", back_populates="chunks")