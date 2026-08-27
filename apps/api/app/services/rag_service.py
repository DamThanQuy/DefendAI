"""
Unified RAG Service — High-level API cho toàn bộ RAG pipeline.

Wrap: Embedder + Retriever (Hybrid) + Reranker + Context Packing
Cung cấp interface đơn giản cho: Mock Room Q&A, Code Explain, Suggested Questions, Document Review.
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field

from app.core.config import settings
from app.services.embedder import embed
from app.services.retriever import retrieve, retrieve_reference, retrieve_mixed
from app.services.reranker import rerank_chunks

logger = logging.getLogger(__name__)


@dataclass
class RAGContext:
    """Structured context cho LLM prompt."""
    query: str
    user_chunks: List[Dict[str, Any]] = field(default_factory=list)
    ref_chunks: List[Dict[str, Any]] = field(default_factory=list)
    code_chunks: List[Dict[str, Any]] = field(default_factory=list)
    
    def to_prompt_context(
        self,
        max_tokens: int = 8000,
        include_citations: bool = True,
    ) -> str:
        """Format context thành string cho LLM prompt."""
        parts = []
        
        # User document chunks
        if self.user_chunks:
            parts.append("=== USER DOCUMENTS ===")
            for i, chunk in enumerate(self.user_chunks):
                citation = f"[USER:{chunk['filename']}:chunk{chunk['chunk_index']}]" if include_citations else ""
                parts.append(f"{citation} {chunk['content']}")
        
        # Reference chunks
        if self.ref_chunks:
            parts.append("\n=== REFERENCE DOCUMENTS ===")
            for i, chunk in enumerate(self.ref_chunks):
                citation = f"[REF:{chunk['title']}:chunk{chunk['chunk_index']}]" if include_citations else ""
                parts.append(f"{citation} {chunk['content']}")
        
        # Code chunks
        if self.code_chunks:
            parts.append("\n=== SOURCE CODE ===")
            for i, chunk in enumerate(self.code_chunks):
                citation = f"[CODE:{chunk.get('file_path', 'unknown')}:chunk{chunk.get('chunk_index', 0)}]" if include_citations else ""
                parts.append(f"{citation} {chunk['content']}")
        
        full_context = "\n\n".join(parts)
        
        # Truncate to max_tokens (rough estimation: 1 token ≈ 4 chars)
        max_chars = max_tokens * 4
        if len(full_context) > max_chars:
            full_context = full_context[:max_chars] + "\n\n[... truncated ...]"
        
        return full_context
    
    def get_citations(self) -> List[Dict[str, Any]]:
        """Trích xuất citations cho response."""
        citations = []
        for chunk in self.user_chunks:
            citations.append({
                "source": "user",
                "filename": chunk.get("filename"),
                "chunk_index": chunk.get("chunk_index"),
                "score": chunk.get("score"),
            })
        for chunk in self.ref_chunks:
            citations.append({
                "source": "ref",
                "title": chunk.get("title"),
                "chunk_index": chunk.get("chunk_index"),
                "score": chunk.get("score"),
            })
        for chunk in self.code_chunks:
            citations.append({
                "source": "code",
                "file_path": chunk.get("file_path"),
                "chunk_index": chunk.get("chunk_index"),
                "score": chunk.get("score"),
            })
        return citations


class RAGService:
    """
    Unified RAG Service — Single entry point cho toàn bộ RAG pipeline.
    
    Pipeline: Query → Embed → Hybrid Retrieve → Rerank → Pack Context
    """
    
    def __init__(
        self,
        use_hybrid: bool = None,
        use_reranker: bool = None,
        top_k: int = None,
        rerank_top_k: int = None,
    ):
        self.use_hybrid = use_hybrid if use_hybrid is not None else settings.rag.hybrid_enabled
        self.use_reranker = use_reranker if use_reranker is not None else settings.rag.reranker_enabled
        self.top_k = top_k or settings.rag.top_k
        self.rerank_top_k = rerank_top_k or settings.rag.rrf_top_k
    
    async def retrieve_user_docs(
        self,
        query: str,
        workspace_id: int,
        top_k: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Retrieve user documents (workspace documents)."""
        k = top_k or self.top_k
        return await retrieve(query, workspace_id, top_k=k, use_hybrid=self.use_hybrid)
    
    async def retrieve_reference_docs(
        self,
        query: str,
        top_k: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Retrieve reference documents (rubric, textbooks, samples)."""
        k = top_k or settings.rag.ref_top_k
        return await retrieve_reference(query, top_k=k)
    
    async def retrieve_code(
        self,
        query: str,
        workspace_id: int,
        top_k: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Retrieve code chunks from workspace (ZIP/RAR uploads)."""
        # Reuse retrieve but filter for code files
        k = top_k or self.top_k
        chunks = await retrieve(query, workspace_id, top_k=k * 2, use_hybrid=self.use_hybrid)
        # Filter for code-like chunks (by filename extension or content)
        code_extensions = {".py", ".js", ".ts", ".java", ".cs", ".go", ".cpp", ".c", ".h", ".rs", ".php", ".rb"}
        code_chunks = []
        for chunk in chunks:
            filename = chunk.get("filename", "").lower()
            if any(filename.endswith(ext) for ext in code_extensions):
                chunk = chunk.copy()
                chunk["source"] = "code"
                code_chunks.append(chunk)
            if len(code_chunks) >= (top_k or self.top_k):
                break
        return code_chunks[:top_k] if top_k else code_chunks
    
    async def retrieve_all(
        self,
        query: str,
        workspace_id: int,
        include_ref: bool = True,
        top_k: Optional[int] = None,
    ) -> Tuple[List[Dict], List[Dict], List[Dict]]:
        """Retrieve all: user docs + reference docs + code docs."""
        k = top_k or self.top_k
        
        # Parallel retrieval
        import asyncio
        user_task = self.retrieve_user_docs(query, workspace_id, top_k=k)
        ref_task = self.retrieve_reference_docs(query, top_k=settings.rag.ref_top_k) if include_ref else []
        code_task = self.retrieve_code(query, workspace_id, top_k=k)
        
        if include_ref:
            user_chunks, ref_chunks, code_chunks = await asyncio.gather(
                user_task, ref_task, code_task
            )
        else:
            user_chunks, code_chunks = await asyncio.gather(user_task, code_task)
            ref_chunks = []
        
        return user_chunks, ref_chunks, code_chunks
    
    async def rerank(
        self,
        query: str,
        chunks: List[Dict[str, Any]],
        top_k: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Rerank chunks using cross-encoder."""
        if not self.use_reranker or not chunks:
            return chunks[:top_k] if top_k else chunks
        
        k = top_k or self.rerank_top_k
        
        try:
            from app.services.reranker import rerank_chunks
            return await rerank_chunks(query, chunks, top_k=k)
        except Exception as exc:
            logger.warning(f"Rerank failed, returning original: {exc}")
            return chunks[:top_k] if top_k else chunks
    
    async def query(
        self,
        query: str,
        workspace_id: int,
        include_ref: bool = True,
        include_code: bool = True,
        top_k: Optional[int] = None,
        rerank: bool = None,
    ) -> RAGContext:
        """
        Full RAG query: Retrieve → Rerank → Pack Context.
        
        Returns:
            RAGContext with user_chunks, ref_chunks, code_chunks (reranked if enabled)
        """
        use_reranker = self.use_reranker if rerank is None else rerank
        k = top_k or self.top_k
        
        # Parallel retrieval
        import asyncio
        user_task = self.retrieve_user_docs(query, workspace_id, top_k=k * 2 if self.use_reranker else k)
        ref_task = self.retrieve_reference_docs(query, top_k=settings.rag.ref_top_k) if include_ref else []
        code_task = self.retrieve_code(query, workspace_id, top_k=k) if include_code else []
        
        if include_ref:
            user_chunks, ref_chunks, code_chunks = await asyncio.gather(
                user_task, ref_task, code_task
            )
        else:
            user_chunks, code_chunks = await asyncio.gather(user_task, code_task)
            ref_chunks = []
        
        # Combine user + code for reranking
        all_chunks = user_chunks + code_chunks
        
        # Rerank
        if use_reranker and all_chunks:
            all_chunks = await self.rerank(query, all_chunks, top_k=k)
        
        # Split back
        user_chunks = [c for c in all_chunks if c.get("source") == "user"]
        code_chunks = [c for c in all_chunks if c.get("source") == "code"]
        
        return RAGContext(
            query=query,
            user_chunks=user_chunks,
            ref_chunks=ref_chunks,
            code_chunks=code_chunks,
        )


# Convenience functions
async def rag_query(
    query: str,
    workspace_id: int,
    include_ref: bool = True,
    include_code: bool = True,
    top_k: int = None,
    use_hybrid: bool = True,
    use_reranker: bool = True,
) -> RAGContext:
    """One-liner RAG query."""
    service = RAGService(
        use_hybrid=use_hybrid,
        use_reranker=use_reranker,
    )
    return await service.query(
        query=query,
        workspace_id=workspace_id,
        include_ref=include_ref,
        include_code=include_code,
        top_k=top_k,
    )


async def rag_query_simple(
    query: str,
    workspace_id: int,
    top_k: int = 8,
) -> str:
    """Simple RAG query returning formatted context string."""
    context = await rag_query(query, workspace_id, top_k=top_k)
    return context.to_prompt_context()


# Export
__all__ = [
    "RAGContext",
    "RAGService",
    "rag_query",
    "rag_query_simple",
]