"""
Cross-encoder Reranker Service — re-rank retrieved chunks for higher precision.

Sử dụng cross-encoder model (local hoặc API) để score lại (query, chunk) pairs
sau khi retrieve từ vector/BM25 search. Cải thiện precision@k đáng kể.
"""

import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class RerankResult:
    """Kết quả rerank cho 1 chunk."""
    content: str
    filename: str
    chunk_index: int
    original_score: float
    rerank_score: float
    source: str
    metadata: Dict[str, Any]


class BaseReranker:
    """Base class cho các reranker implementations."""
    
    def __init__(self, model_name: str, max_length: int = 512):
        self.model_name = model_name
        self.max_length = max_length
    
    async def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: Optional[int] = None,
    ) -> List[RerankResult]:
        """Rerank documents dựa trên relevance với query."""
        raise NotImplementedError


class CrossEncoderReranker(BaseReranker):
    """
    Cross-encoder reranker sử dụng HuggingFace transformers (local) hoặc API.
    
    Model mặc định: cross-encoder/ms-marco-MiniLM-L-6-v2 (nhỏ, nhanh)
    Hoặc: cross-encoder/ms-marco-MiniLM-L-12-v2 (đ 정확 hơn)
    """
    
    def __init__(
        self,
        model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2",
        max_length: int = 512,
        device: str = "cpu",
        batch_size: int = 32,
        use_api: bool = False,
        api_url: str = "",
    ):
        super().__init__(model_name, max_length)
        self.device = device
        self.batch_size = batch_size
        self.use_api = use_api
        self.api_url = api_url
        
        if not use_api:
            self._load_local_model(model_name, device)
    
    def _load_local_model(self, model_name: str, device: str):
        """Load local cross-encoder model."""
        try:
            from sentence_transformers import CrossEncoder
            import torch
            
            self.model = CrossEncoder(model_name, max_length=self.max_length, device=device)
            self._model_loaded = True
            logger.info(f"Loaded cross-encoder model: {model_name} on {device}")
        except ImportError:
            logger.warning("sentence-transformers not installed, falling back to API")
            self.use_api = True
            self._model_loaded = False
        except Exception as exc:
            logger.warning(f"Failed to load local reranker: {exc}, falling back to API")
            self.use_api = True
            self._model_loaded = False
    
    async def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Rerank documents using cross-encoder."""
        if not documents:
            return []
        
        if self.use_api or not getattr(self, '_model_loaded', False):
            return await self._rerank_api(query, documents, top_k)
        
        return await self._rerank_local(query, documents, top_k)
    
    async def _rerank_local(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Rerank using local cross-encoder model."""
        import torch
        
        # Prepare pairs
        pairs = []
        for doc in documents:
            content = doc.get("content", "")
            # Truncate if too long
            if len(content) > self.max_length * 4:  # rough char to token ratio
                content = content[:self.max_length * 4]
            pairs.append([query, content])
        
        # Batch inference
        scores = []
        for i in range(0, len(pairs), self.batch_size):
            batch = pairs[i:i + self.batch_size]
            with torch.no_grad():
                batch_scores = self.model.predict(batch, show_progress_bar=False)
            scores.extend(batch_scores.tolist())
        
        # Combine results
        results = []
        for i, (doc, score) in enumerate(zip(documents, scores)):
            result = {
                **doc,
                "rerank_score": float(score),
                "original_score": doc.get("score", 0.0),
            }
            results.append(result)
        
        # Sort by rerank score desc
        results.sort(key=lambda x: x["rerank_score"], reverse=True)
        
        if top_k:
            results = results[:top_k]
        
        return results
    
    async def _rerank_api(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Rerank using external API (e.g., local gateway, NVIDIA NIM)."""
        import httpx
        
        if not self.api_url:
            logger.warning("No API URL configured for reranker, returning original order")
            return documents[:top_k] if top_k else documents
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                payload = {
                    "query": query,
                    "documents": [doc.get("content", "") for doc in documents],
                    "top_k": top_k or len(documents),
                }
                resp = await client.post(
                    f"{self.api_url}/rerank",
                    json=payload,
                    timeout=30.0,
                )
                resp.raise_for_status()
                data = resp.json()
                
                # Expect format: {"results": [{"index": int, "score": float}, ...]}
                results = data.get("results", [])
                reranked = []
                for res in results:
                    idx = res.get("index", 0)
                    score = res.get("score", 0.0)
                    if idx < len(documents):
                        doc = documents[idx].copy()
                        doc["rerank_score"] = float(score)
                        doc["original_score"] = doc.get("score", 0.0)
                        reranked.append(doc)
                
                return reranked[:top_k] if top_k else reranked
                
        except Exception as exc:
            logger.warning(f"Rerank API failed: {exc}, returning original order")
            return documents[:top_k] if top_k else documents


class MockReranker(BaseReranker):
    """Mock reranker for testing/development - returns original order with mock scores."""
    
    def __init__(self, model_name: str = "mock", max_length: int = 512):
        super().__init__(model_name, max_length)
    
    async def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        # Add mock rerank scores based on keyword overlap
        query_terms = set(query.lower().split())
        results = []
        for doc in documents:
            content = doc.get("content", "").lower()
            overlap = sum(1 for term in query_terms if term in content)
            mock_score = min(0.9, 0.3 + overlap * 0.1)
            
            result = {
                **doc,
                "rerank_score": mock_score,
                "original_score": doc.get("score", 0.0),
            }
            results.append(result)
        
        results.sort(key=lambda x: x["rerank_score"], reverse=True)
        return results[:top_k] if top_k else results


# Factory function
async def get_reranker() -> BaseReranker:
    """Factory để lấy reranker instance dựa trên config."""
    provider = getattr(settings, "reranker_provider", "mock").lower()
    model = getattr(settings, "reranker_model", "cross-encoder/ms-marco-MiniLM-L-6-v2")
    device = getattr(settings, "reranker_device", "cpu")
    use_api = getattr(settings, "reranker_use_api", False)
    api_url = getattr(settings, "reranker_api_url", "")
    
    if provider == "cross-encoder":
        return CrossEncoderReranker(
            model_name=model,
            device=device,
            use_api=use_api,
            api_url=api_url,
        )
    elif provider == "api":
        # Use API-only reranker (no local model)
        reranker = CrossEncoderReranker(model_name=model, use_api=True, api_url=api_url)
        reranker._model_loaded = False
        return reranker
    else:
        return MockReranker()


# Convenience function
async def rerank_chunks(
    query: str,
    chunks: List[Dict[str, Any]],
    top_k: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Convenience function để rerank chunks."""
    reranker = await get_reranker()
    return await reranker.rerank(query, chunks, top_k)