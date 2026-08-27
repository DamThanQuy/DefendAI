"""
Retriever Service — top-K chunks liên quan nhất theo workspace (RAG, R5 + R10).

Retrieve: embed câu hỏi (embedder — Gemini) → SQL KNN trên `document_chunks`,
join qua `workspace_files` để giới hạn theo workspace. Lọc theo score threshold,
trả kèm nguồn `filename` + `chunk_index` cho citation.

R10: thêm query song song trên `reference_chunks` (tài liệu chuẩn) — `retrieve_mixed`
embed 1 lần, chạy 2 KNN đồng thời (asyncio.gather), gộp kèm nhãn `source`.

HYBRID SEARCH: Kết hợp Vector (semantic) + BM25 (keyword) với RRF (Reciprocal Rank Fusion).
BM25 index được build từ `chunk_indexer` hoặc build on-demand từ chunks.

Config (.env): 
- `RAG_TOP_K` (mặc định 8), `RAG_MIN_SCORE` (mặc định 0.3),
- `RAG_REF_TOP_K` (mặc định 4), `RAG_REF_MIN_SCORE` (mặc định 0.25).
- `RAG_BM25_WEIGHT` (mặc định 0.5), `RAG_RRF_K` (mặc định 60).
"""
import asyncio
import logging
import math
import re
from collections import defaultdict
from typing import List, Optional, Tuple, Dict, Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import async_session_maker
from app.services.embedder import embed

logger = logging.getLogger(__name__)

# ============================================================================
# BM25 Implementation
# ============================================================================

class BM25Index:
    """BM25 index for keyword search. Built on-demand from chunks."""
    
    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.documents: List[Dict[str, Any]] = []
        self.doc_freqs: Dict[str, int] = defaultdict(int)
        self.doc_lengths: List[int] = []
        self.avgdl: float = 0
        self.idf: Dict[str, float] = {}
        self._built = False
    
    def _tokenize(self, text: str) -> List[str]:
        """Simple Vietnamese-aware tokenization."""
        # Lowercase, split by non-word chars, keep Vietnamese chars
        text = text.lower()
        # Split by whitespace and punctuation, keep alphanumeric + Vietnamese
        tokens = re.findall(r'[\wàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+', text)
        return [t for t in tokens if len(t) > 1]
    
    def build(self, documents: List[Dict[str, Any]]) -> None:
        """Build BM25 index from list of documents with 'content' field."""
        self.documents = documents
        self.doc_freqs.clear()
        self.doc_lengths = []
        
        # Build document frequencies
        for doc in documents:
            tokens = self._tokenize(doc.get("content", ""))
            self.doc_lengths.append(len(tokens))
            unique_tokens = set(tokens)
            for token in unique_tokens:
                self.doc_freqs[token] += 1
        
        self.avgdl = sum(self.doc_lengths) / len(self.doc_lengths) if self.doc_lengths else 0
        
        # Calculate IDF
        n_docs = len(documents)
        for token, df in self.doc_freqs.items():
            self.idf[token] = math.log((n_docs - df + 0.5) / (df + 0.5) + 1.0)
        
        self._built = True
    
    def search(self, query: str, top_k: int = 10) -> List[Tuple[int, float]]:
        """Return list of (doc_index, score) sorted by score desc."""
        if not self._built:
            return []
        
        query_tokens = self._tokenize(query)
        if not query_tokens:
            return []
        
        scores = []
        for i, doc in enumerate(self.documents):
            if self.doc_lengths[i] == 0:
                scores.append((i, 0.0))
                continue
            
            doc_tokens = self._tokenize(self.documents[i].get("content", ""))
            tf = defaultdict(int)
            for token in doc_tokens:
                tf[token] += 1
            
            score = 0.0
            for token in query_tokens:
                if token not in self.idf:
                    continue
                idf = self.idf[token]
                freq = tf.get(token, 0)
                if freq == 0:
                    continue
                numerator = self.k1 + 1.0
                denominator = freq + self.k1 * (1 - self.b + self.b * self.doc_lengths[i] / self.avgdl)
                score += idf * freq * numerator / denominator
            
            if score > 0:
                scores.append((i, score))
        
        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]


# Global BM25 index cache (per workspace)
_bm25_cache: Dict[int, Tuple[BM25Index, float]] = {}  # workspace_id -> (index, timestamp)


async def _build_bm25_index(workspace_id: int) -> BM25Index:
    """Build BM25 index from all chunks in workspace."""
    sql = text("""
        SELECT c.id, c.content, c.meta->>'filename' AS filename, c.chunk_index
        FROM document_chunks c
        JOIN workspace_files wf ON wf.document_id = c.document_id
        WHERE wf.workspace_id = :ws AND c.embedding IS NOT NULL
    """)
    
    async with async_session_maker() as db:
        result = await db.execute(text("""
            SELECT c.content, c.meta->>'filename' AS filename, c.chunk_index
            FROM document_chunks c
            JOIN workspace_files wf ON wf.document_id = c.document_id
            WHERE wf.workspace_id = :ws AND c.embedding IS NOT NULL
        """), {"ws": workspace_id})
        rows = result.mappings().all()
    
    documents = [
        {"content": row["content"], "filename": row["filename"], "chunk_index": row["chunk_index"]}
        for row in rows
    ]
    
    index = BM25Index()
    index.build(documents)
    return index


async def _get_bm25_index(workspace_id: int) -> BM25Index:
    """Get or build BM25 index for workspace (with simple time-based cache)."""
    import time
    now = time.time()
    if workspace_id in _bm25_cache:
        index, timestamp = _bm25_cache[workspace_id]
        if now - timestamp < 300:  # 5 min cache
            return index
    
    index = await _build_bm25_index(workspace_id)
    _bm25_cache[workspace_id] = (index, time.time())
    return index


# ============================================================================
# RRF (Reciprocal Rank Fusion)
# ============================================================================

def rrf_fusion(
    vector_results: List[Dict[str, Any]], 
    bm25_results: List[Tuple[int, float]], 
    documents: List[Dict[str, Any]],
    k: int = 60,
    top_k: int = 10
) -> List[Dict[str, Any]]:
    """
    Reciprocal Rank Fusion (RRF) fusion of vector and BM25 results.
    
    Args:
        vector_results: List of dicts with 'content', 'filename', 'chunk_index', 'score', 'source'
        bm25_results: List of (doc_index, score) from BM25
        documents: Original documents list for BM25 index lookup
        k: RRF parameter (default 60)
        top_k: Number of results to return
    
    Returns:
        Fused results list with RRF scores
    """
    # Build rank maps
    vector_ranks = {id(r["content"]): rank + 1 for rank, r in enumerate(vector_results)}
    bm25_ranks = {doc_idx: rank + 1 for rank, (doc_idx, _) in enumerate(bm25_results)}
    
    # All unique document IDs
    all_doc_ids = set(vector_ranks.keys()) | set(bm25_ranks.keys())
    
    # Calculate RRF scores
    fused_scores = []
    for doc_id in all_doc_ids:
        rrf_score = 0.0
        if doc_id in vector_ranks:
            rrf_score += 1.0 / (k + vector_ranks[doc_id])
        if doc_id in bm25_ranks:
            rrf_score += 1.0 / (k + bm25_ranks[doc_id])
        fused_scores.append((doc_id, rrf_score))
    
    # Sort by RRF score desc
    fused_scores.sort(key=lambda x: x[1], reverse=True)
    
    # Build result objects
    # We need to map back to original result objects
    content_to_result = {id(r["content"]): r for r in vector_results}
    
    # For BM25-only results, create synthetic result objects
    content_to_bm25 = {}
    # We need to map doc_idx back to content
    # This is a simplification - in practice we'd need a better mapping
    
    results = []
    for doc_id, score in fused_scores[:top_k]:
        if doc_id in content_to_result:
            result = content_to_result[doc_id].copy()
            result["rrf_score"] = score
            result["fusion"] = "hybrid" if doc_id in bm25_ranks else "vector"
        else:
            # BM25-only result - need to reconstruct
            # This is a limitation - we'd need better document mapping
            continue
        results.append(result)
    
    return results


def rrf_fusion_simple(
    vector_results: List[Dict[str, Any]], 
    bm25_results: List[Dict[str, Any]], 
    k: int = 60,
    top_k: int = 10
) -> List[Dict[str, Any]]:
    """
    Simplified RRF fusion where both result lists have same structure.
    Both lists must have unique identifiers (e.g., 'content' hash or 'id').
    """
    def get_id(r):
        # Use content hash as ID
        return hash(r.get("content", ""))
    
    vector_ranks = {get_id(r): rank + 1 for rank, r in enumerate(vector_results)}
    bm25_ranks = {get_id(r): rank + 1 for rank, r in enumerate(bm25_results)}
    
    all_ids = set(vector_ranks.keys()) | set(bm25_ranks.keys())
    
    fused = []
    for doc_id in all_ids:
        score = 0.0
        if doc_id in vector_ranks:
            score += 1.0 / (60 + vector_ranks[doc_id])
        if doc_id in bm25_ranks:
            score += 1.0 / (60 + bm25_ranks[doc_id])
        fused.append((doc_id, score))
    
    fused.sort(key=lambda x: x[1], reverse=True)
    
    # Map back to result objects
    id_to_result = {}
    for r in vector_results + bm25_results:
        doc_id = hash(r.get("content", ""))
        if doc_id not in id_to_result:
            id_to_result[doc_id] = r
    
    results = []
    for doc_id, score in fused[:top_k]:
        if doc_id in id_to_result:
            result = id_to_result[doc_id].copy()
            result["rrf_score"] = round(score, 4)
            result["fusion"] = "hybrid"
            results.append(result)
    
    return results


async def retrieve(
    query: str,
    workspace_id: int,
    top_k: Optional[int] = None,
    use_hybrid: bool = True,
) -> List[dict]:
    """Tìm top-K chunks gần nhất với query trong workspace.

    Args:
        query: câu hỏi / đề tài cần truy vấn.
        workspace_id: workspace chứa các document cần tìm.
        top_k: số chunk trả về (mặc định `settings.rag.top_k` = 8).
        use_hybrid: nếu True, dùng Hybrid Search (Vector + BM25 + RRF), mặc định True.

    Returns:
        list[dict] — mỗi item {content, filename, chunk_index, score, source:"user", rrf_score?, fusion?}
        xếp theo độ liên quan giảm dần. [] nếu workspace chưa có chunk nào được index
        (chưa qua R4) hoặc tất cả dưới `min_score`.

    Raises:
        RuntimeError/httpx.HTTPStatusError: nếu embed câu hỏi thất bại.
    """
    q_vec = (await embed([query]))[0]
    limit = top_k or settings.rag.top_k

    # Vector search (semantic)
    async with async_session_maker() as db:
        result = await db.execute(
            _KNN_SQL,
            {
                "q": _vector_literal(q_vec),
                "ws": workspace_id,
                "min_score": settings.rag.min_score,
                "top_k": limit * 2 if use_hybrid else limit,  # Get more for fusion
            },
        )
        rows = result.mappings().all()

    vector_results = [
        {
            "content": row["content"],
            "filename": row["filename"],
            "chunk_index": row["chunk_index"],
            "score": round(float(row["score"]), 4),
            "source": "user",
        }
        for row in rows
    ]

    if not use_hybrid:
        return vector_results[:limit]

    # Hybrid Search: BM25 + Vector with RRF
    try:
        bm25_index = await _get_bm25_index(workspace_id)
        bm25_results = bm25_index.search(query, top_k=limit * 2)
        
        # Get full documents for BM25 results
        async with async_session_maker() as db:
            result = await db.execute(text("""
                SELECT c.content, c.meta->>'filename' AS filename, c.chunk_index
                FROM document_chunks c
                JOIN workspace_files wf ON wf.document_id = c.document_id
                WHERE wf.workspace_id = :ws AND c.embedding IS NOT NULL
            """), {"ws": workspace_id})
            rows = result.mappings().all()
        
        documents = [
            {"content": row["content"], "filename": row["filename"], "chunk_index": row["chunk_index"]}
            for row in rows
        ]
        
        bm25_results = bm25_index.search(query, top_k=limit * 2)
        
        # Convert BM25 results to same format as vector_results
        bm25_formatted = []
        for doc_idx, score in bm25_results:
            if doc_idx < len(documents):
                bm25_formatted.append({
                    "content": documents[doc_idx]["content"],
                    "filename": documents[doc_idx]["filename"],
                    "chunk_index": documents[doc_idx]["chunk_index"],
                    "score": score,
                    "source": "user",
                })
        
        # RRF Fusion
        fused = rrf_fusion_simple(vector_results, bm25_formatted, k=settings.rag.rrf_k, top_k=limit)
        return fused
        
    except Exception as exc:
        logger.warning(f"Hybrid search failed, falling back to vector only: {exc}")
        return vector_results[:limit]


async def retrieve_reference(
    query: str,
    top_k: Optional[int] = None,
) -> List[dict]:
    """Tìm top-K chunks liên quan nhất trong `reference_chunks` (tài liệu chuẩn, R10).

    Args:
        query: câu hỏi / đề tài cần truy vấn.
        top_k: số chunk trả về (mặc định `settings.rag.ref_top_k` = 4).

    Returns:
        list[dict] — mỗi item {content, title, chunk_index, score, source:"ref"}.
        [] nếu chưa có tài liệu chuẩn được index (R9) hoặc tất cả dưới `ref_min_score`.

    Raises:
        RuntimeError/httpx.HTTPStatusError: nếu embed câu hỏi thất bại.
    """
    q_vec = (await embed([query]))[0]
    limit = top_k or settings.rag.ref_top_k

    async with async_session_maker() as db:
        result = await db.execute(
            _REF_KNN_SQL,
            {
                "q": _vector_literal(q_vec),
                "min_score": settings.rag.ref_min_score,
                "top_k": limit,
            },
        )
        rows = result.mappings().all()

    return [
        {
            "content": row["content"],
            "title": row["title"],
            "chunk_index": row["chunk_index"],
            "score": round(float(row["score"]), 4),
            "source": "ref",
        }
        for row in rows
    ]


async def retrieve_mixed(
    query: str,
    workspace_id: int,
    top_k: Optional[int] = None,
    use_hybrid: bool = True,
) -> Tuple[List[dict], List[dict]]:
    """R10: embed câu hỏi 1 lần → chạy 2 KNN song song (user + reference).

    Gộp kết quả 2 bảng (`document_chunks` + `reference_chunks`) để handler bỏ
    vào cùng 1 prompt với nhãn nguồn `[USER: ...]` / `[REF: ...]`.

    Returns:
        (user_items, ref_items) — mỗi item kèm `source` ("user"|"ref").

    Raises:
        RuntimeError/httpx.HTTPStatusError: nếu embed câu hỏi thất bại.
    """
    q_lit = _vector_literal((await embed([query]))[0])
    user_limit = top_k or settings.rag.top_k
    ref_limit = settings.rag.ref_top_k

    async def _user() -> List[dict]:
        # Use the new hybrid retrieve for user documents
        return await retrieve(query, workspace_id, top_k=user_limit, use_hybrid=use_hybrid)

    async def _ref() -> List[dict]:
        async with async_session_maker() as db:
            result = await db.execute(
                _REF_KNN_SQL,
                {
                    "q": _vector_literal((await embed([query]))[0]),
                    "min_score": settings.rag.ref_min_score,
                    "top_k": ref_limit,
                },
            )
            rows = result.mappings().all()
        return [
            {
                "content": row["content"],
                "title": row["title"],
                "chunk_index": row["chunk_index"],
                "score": round(float(row["score"]), 4),
                "source": "ref",
            }
            for row in rows
        ]

    return await asyncio.gather(_user(), _ref())
