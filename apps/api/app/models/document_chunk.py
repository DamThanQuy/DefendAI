from datetime import datetime

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class DocumentChunk(Base):
    """Bể chứa chunk text + embedding + metadata — nguồn retrieve cho RAG.

    Mỗi chunk là một đoạn text đã tách từ document upload, dùng làm input
    cho retriever và làm căn cứ (provenance) cho citation gắn vào từng câu
    trả lời trong `assessments.questions`.

    Field `embedding` đang để Text (lưu JSON-encoded vector) làm placeholder
    để tránh phụ thuộc pgvector ở local dev. Khi bật pgvector, đổi sang
    Vector(1024); meta đổi sang JSONB.
    """

    __tablename__ = "document_chunks"

    id = Column(BigInteger, primary_key=True, autoincrement=True, index=True)
    document_id = Column(
        Integer, ForeignKey("documents.id"), nullable=False, index=True
    )
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Text, nullable=True)
    meta = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    document = relationship("Document", back_populates="chunks")