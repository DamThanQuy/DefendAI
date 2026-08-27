"""
RAG Integration cho Mock Room AI Q&A.

Cung cấp context retrieval chuyên biệt cho Q&A session:
- Retrieve theo CLO cụ thể
- Combine user docs + reference docs + code
- Context packing cho LLM prompt
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field

from app.core.config import settings
from app.services.rag_service import RAGService
from app.prompts.mock_qa import (
    CLO_NAMES,
    get_clo_weight_oga,
    get_clo_weight_tda,
    CLO_PRIORITY,
    CLO_QUERY_TEMPLATES,
    CLO_KEYWORDS,
)

logger = logging.getLogger(__name__)


# CLO-specific query templates for retrieval
CLO_QUERY_TEMPLATES = {
    "CLO1": "SRS problem statement actors use cases functional requirements business rules",
    "CLO2": "SDD architecture design patterns API specification database ERD sequence diagram",
    "CLO3": "implementation code structure modules testing CI/CD deployment",
    "CLO4": "PMP project management plan WBS risk management schedule resource",
    "CLO5": "user guide installation manual admin guide troubleshooting FAQ",
    "CLO6": "presentation demo communication skills Q&A defense",
    "CLO7": "attitude professional ethics teamwork learning",
}

# CLO-specific keywords for boosting
CLO_KEYWORDS = {
    "CLO1": ["SRS", "requirement", "use case", "actor", "functional", "business rule", "actor"],
    "CLO2": ["architecture", "design", "ERD", "sequence", "API", "database", "schema", "component"],
    "CLO3": ["implementation", "code", "module", "test", "CI/CD", "deployment", "algorithm"],
    "CLO4": ["PMP", "WBS", "risk", "schedule", "resource", "milestone", "Gantt"],
    "CLO5": ["user guide", "manual", "installation", "tutorial", "FAQ", "troubleshoot"],
    "CLO6": ["presentation", "demo", "communication", "Q&A", "defense", "soft skill"],
    "CLO7": ["attitude", "professional", "ethics", "teamwork", "learning"],
}


@dataclass
class MockQARAGConfig:
    """Config cho RAG trong Mock Q&A."""
    top_k_user: int = 8
    top_k_ref: int = 4
    top_k_code: int = 4
    use_hybrid: bool = True
    use_reranker: bool = True
    max_context_tokens: int = 8000
    min_score: float = 0.3
    ref_min_score: float = 0.25


class MockQARAGService:
    """
    RAG Service chuyên biệt cho Mock Room Q&A.
    
    Cung cấp context retrieval theo CLO cho Q&A session.
    """
    
    def __init__(
        self,
        rag_service,
        config: MockQARAGConfig = None,
    ):
        self.rag = rag_service
        self.config = config or MockQARAGConfig()
    
    async def get_context_for_clo(
        self,
        clo: str,
        workspace_id: int,
        query: str = None,
        top_k: int = None,
    ) -> Dict[str, Any]:
        """
        Lấy context cho một CLO cụ thể.
        
        Args:
            clo: CLO code (CLO1-CLO7)
            workspace_id: Workspace ID
            query: Custom query (optional, dùng template nếu không có)
            top_k: Số chunks trả về
        
        Returns:
            Dict với user_chunks, ref_chunks, code_chunks, citations
        """
        if query is None:
            query = self._build_clo_query(clo)
        
        top_k = top_k or self.config.top_k_user
        
        # Parallel retrieval
        import asyncio
        user_task = self.rag.retrieve_user_docs(query, workspace_id, top_k=top_k * 2)
        ref_task = self.rag.retrieve_reference_docs(query, top_k=self.config.top_k_ref)
        code_task = self.rag.retrieve_code(query, workspace_id, top_k=self.config.top_k_code)
        
        user_chunks, ref_chunks, code_chunks = await asyncio.gather(
            user_task, ref_task, code_task
        )
        
        # Filter/boost by CLO-specific keywords
        user_chunks = self._boost_by_clo_keywords(user_chunks, clo)
        code_chunks = self._boost_by_clo_keywords(code_chunks, clo)
        
        return {
            "clo": clo,
            "query": query,
            "user_chunks": user_chunks[:top_k] if top_k else user_chunks,
            "ref_chunks": ref_chunks[:self.config.top_k_ref],
            "code_chunks": code_chunks[:self.config.top_k_code],
        }
    
    async def get_context_for_current_question(
        self,
        session_state: Dict[str, Any],
        workspace_id: int,
        question: str = None,
    ) -> Dict[str, Any]:
        """
        Lấy context cho câu hỏi hiện tại dựa trên state session.
        
        Args:
            session_state: Dict chứa current_clo, coverage, history, etc.
            workspace_id: Workspace ID
            question: Câu hỏi hiện tại (optional)
        
        Returns:
            Dict với context cho LLM prompt
        """
        current_clo = session_state.get("current_clo", "CLO1")
        coverage = session_state.get("coverage", {})
        
        # Build query từ question hoặc template
        if question:
            query = question
        else:
            query = self._build_context_query(current_clo, coverage)
        
        context = await self.get_context_for_clo(
            clo=current_clo,
            workspace_id=workspace_id,
            query=question,
            top_k=8,
        )
        
        # Add metadata
        context["current_clo"] = current_clo
        context["coverage"] = coverage
        context["clo_name"] = CLO_NAMES.get(current_clo, current_clo)
        context["clo_weight_oga"] = get_clo_weight_oga(current_clo)
        context["clo_weight_tda"] = get_clo_weight_tda(current_clo)
        
        return context
    
    def _build_clo_query(self, clo: str) -> str:
        """Build query template cho CLO."""
        template = CLO_QUERY_TEMPLATES.get(clo, clo)
        keywords = CLO_KEYWORDS.get(clo, [])
        return f"{template} {' '.join(keywords[:5])}"
    
    def _boost_by_clo_keywords(self, chunks: List[Dict], clo: str) -> List[Dict]:
        """Boost score cho chunks chứa keywords của CLO."""
        keywords = CLO_KEYWORDS.get(clo, [])
        if not keywords:
            return chunks
        
        boosted = []
        for chunk in chunks:
            content = chunk.get("content", "").lower()
            boost = sum(1 for kw in keywords if kw.lower() in content)
            chunk = chunk.copy()
            chunk["clo_boost"] = boost
            chunk["boosted_score"] = chunk.get("score", 0) + (boost * 0.1)
            boosted.append(chunk)
        
        # Sort by boosted score
        boosted.sort(key=lambda x: x.get("boosted_score", x.get("score", 0)), reverse=True)
        return boosted


def build_context_prompt(context_data: Dict[str, Any]) -> str:
    """Format context data thành string cho LLM prompt."""
    parts = []
    
    # User document chunks
    if context_data.get("user_chunks"):
        parts.append("=== USER DOCUMENTS ===")
        for i, chunk in enumerate(context_data["user_chunks"]):
            citation = f"[USER:{chunk['filename']}:chunk{chunk['chunk_index']}]"
            parts.append(f"{citation} {chunk['content']}")
    
    # Reference chunks
    if context_data.get("ref_chunks"):
        parts.append("\n=== REFERENCE DOCUMENTS ===")
        for i, chunk in enumerate(context_data["ref_chunks"]):
            citation = f"[REF:{chunk['title']}:chunk{chunk['chunk_index']}]"
            parts.append(f"{citation} {chunk['content']}")
    
    # Code chunks
    if context_data.get("code_chunks"):
        parts.append("\n=== SOURCE CODE ===")
        for i, chunk in enumerate(context_data["code_chunks"]):
            citation = f"[CODE:{chunk.get('file_path', 'unknown')}:chunk{chunk.get('chunk_index', 0)}]"
            parts.append(f"{citation} {chunk['content']}")
    
    return "\n\n".join(parts)


def format_citations(context_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Trích xuất citations từ context data."""
    citations = []
    
    for chunk in context_data.get("user_chunks", []):
        citations.append({
            "source": "user",
            "filename": chunk.get("filename"),
            "chunk_index": chunk.get("chunk_index"),
            "score": chunk.get("score"),
        })
    
    for chunk in context_data.get("ref_chunks", []):
        citations.append({
            "source": "ref",
            "title": chunk.get("title"),
            "chunk_index": chunk.get("chunk_index"),
            "score": chunk.get("score"),
        })
    
    for chunk in context_data.get("code_chunks", []):
        citations.append({
            "source": "code",
            "file_path": chunk.get("file_path"),
            "chunk_index": chunk.get("chunk_index"),
            "score": chunk.get("score"),
        })
    
    return citations


def format_clo_weights(clo: str) -> Dict[str, Any]:
    """Format CLO weights cho prompt."""
    return {
        "clo": clo,
        "name": CLO_NAMES.get(clo, clo),
        "oga_weight": get_clo_weight_oga(clo),
        "tda_weight": get_clo_weight_tda(clo),
    }


def format_coverage(coverage: Dict[str, int]) -> Dict[str, Any]:
    """Format coverage info cho prompt."""
    total = sum(coverage.values())
    covered = sum(1 for v in coverage.values() if v > 0)
    total_target = 7
    
    details = {}
    for clo in CLO_NAMES.keys():
        count = coverage.get(clo, 0)
        target = 2  # target 2 questions per CLO
        details[clo] = {
            "name": CLO_NAMES.get(clo, clo),
            "current": count,
            "target": target,
            "progress": min(count / target, 1.0),
        }
    
    return {
        "total_questions": sum(coverage.values()),
        "clo_covered": sum(1 for v in coverage.values() if v > 0),
        "total_clo": 7,
        "details": details,
    }