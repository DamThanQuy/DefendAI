"""
Integration Tests cho RAG Retrieval Pipeline.

Test cases:
1. Vector search cơ bản
2. Hybrid search (Vector + BM25 + RRF)
3. Reference document retrieval
4. Mixed retrieval (user + reference)
5. Reranker integration
6. Latency benchmarks
"""

import asyncio
import time
import pytest
from typing import List, Dict, Any

# Test utilities
def assert_latency_under_ms(elapsed_ms: float, threshold_ms: float):
    """Assert latency is under threshold."""
    assert elapsed_ms < threshold_ms, f"Latency {elapsed_ms:.1f}ms exceeds threshold {threshold_ms}ms"


async def test_vector_search_basic(retriever_service):
    """Test basic vector search returns results."""
    query = "hệ thống SMC-Ride là gì?"
    workspace_id = 1  # test workspace
    
    start = time.time()
    results = await retrieve(query, workspace_id, top_k=5)
    elapsed = (time.time() - start) * 1000
    
    assert isinstance(results, list)
    if results:  # if workspace has data
        assert all("content" in r for r in results)
        assert all("score" in r for r in results)
        assert all(r["source"] == "user" for r in results)
    
    assert_latency_under_ms(elapsed, 3000)  # < 3s


async def test_hybrid_search_returns_fused_results(retriever_service):
    """Test hybrid search returns fused results with RRF scores."""
    query = "SRS hệ thống SMC-Ride"
    workspace_id = 1
    
    start = time.time()
    results = await retrieve(query, workspace_id, top_k=5, use_hybrid=True)
    elapsed = (time.time() - start) * 1000
    
    assert isinstance(results, list)
    if results:
        # Check RRF fusion fields
        for r in results:
            assert "rrf_score" in r or "fusion" in r
        assert_latency_under_ms(elapsed, 5000)  # Hybrid may be slower


async def test_reference_retrieval(retriever_service):
    """Test reference document retrieval."""
    query = "rubric SEP490 chấm điểm"
    
    start = time.time()
    results = await retrieve_reference(query, top_k=3)
    elapsed = (time.time() - start) * 1000
    
    assert isinstance(results, list)
    if results:
        for r in results:
            assert r["source"] == "ref"
            assert "title" in r
    assert_latency_under_ms(elapsed, 3000)


async def test_mixed_retrieval(retriever_service):
    """Test mixed retrieval (user + reference)."""
    query = "SRS hệ thống"
    workspace_id = 1
    
    start = time.time()
    user_chunks, ref_chunks = await retrieve_mixed(query, workspace_id, top_k=5)
    elapsed = (time.time() - start) * 1000
    
    assert isinstance(user_chunks, list)
    assert isinstance(ref_chunks, list)
    assert_latency_under_ms(elapsed, 4000)


async def test_reranker_integration(reranker_service):
    """Test reranker reorders chunks by relevance."""
    query = "Kiến trúc microservices của SMC-Ride"
    
    # Mock documents
    docs = [
        {"content": "Hệ thống sử dụng kiến trúc microservices với 10 services", "score": 0.8, "source": "user"},
        {"content": "Database sử dụng PostgreSQL", "score": 0.6, "source": "user"},
        {"content": "Frontend dùng React Native", "score": 0.5, "source": "user"},
    ]
    
    reranked = await rerank_chunks("kiến trúc microservices", docs, top_k=3)
    
    assert len(reranked) == 3
    assert "rerank_score" in reranked[0]
    # First result should be most relevant (microservices)
    assert reranked[0]["rerank_score"] >= reranked[1]["rerank_score"]


async def test_rag_service_query(rag_service):
    """Test full RAG query pipeline."""
    query = "SRS hệ thống SMC-Ride bao gồm gì?"
    workspace_id = 1
    
    start = time.time()
    context = await rag_service.query(
        query=query,
        workspace_id=workspace_id,
        include_ref=True,
        include_code=False,
        top_k=5,
    )
    elapsed = (time.time() - start) * 1000
    
    assert isinstance(context, RAGContext)
    assert context.query == query
    assert len(context.user_chunks) <= 5
    assert_latency_under_ms(elapsed, 8000)


async def test_rag_service_with_reranker(rag_service):
    """Test RAG service with reranker enabled."""
    query = "Kiến trúc microservices của SMC-Ride"
    workspace_id = 1
    
    start = time.time()
    context = await rag_service.query(
        query=query,
        workspace_id=workspace_id,
        include_ref=True,
        include_code=True,
        top_k=5,
        rerank=True,
    )
    elapsed = (time.time() - start) * 1000
    
    assert context.user_chunks or context.code_chunks
    if context.user_chunks:
        for chunk in context.user_chunks:
            assert "rerank_score" in chunk
    assert_latency_under_ms(elapsed, 10000)


async def test_latency_benchmark(retriever_service):
    """Benchmark retrieval latency under load."""
    queries = [
        "SRS hệ thống là gì?",
        "Kiến trúc microservices",
        "Database schema ERD",
        "Use cases chính",
        "Test cases cho module auth",
    ]
    workspace_id = 1
    
    latencies = []
    for query in queries:
        start = time.time()
        await retrieve(query, workspace_id, top_k=5, use_hybrid=True)
        latencies.append((time.time() - start) * 1000)
    
    avg_latency = sum(latencies) / len(latencies)
    p95_latency = sorted(latencies)[int(len(latencies) * 0.95)]
    
    print(f"Latencies: {latencies}")
    print(f"Avg: {avg_latency:.1f}ms, P95: {p95_latency:.1f}ms")
    
    assert avg_latency < 3000  # Avg < 3s
    assert p95_latency < 5000   # P95 < 5s


async def test_recall_at_k(retriever_service):
    """Test recall@k - known relevant docs should appear in top-k."""
    # This requires a test dataset with known relevant docs
    # Placeholder for when test data is available
    pass


async def test_rrf_fusion_correctness():
    """Unit test RRF fusion logic."""
    from app.services.retriever import rrf_fusion_simple
    
    vector_results = [
        {"content": "doc A", "score": 0.9},
        {"content": "doc B", "score": 0.8},
        {"content": "doc C", "score": 0.7},
    ]
    bm25_results = [
        {"content": "doc B", "score": 0.95},
        {"content": "doc D", "score": 0.85},
        {"content": "doc A", "score": 0.8},
    ]
    
    fused = rrf_fusion_simple(vector_results, bm25_results, k=60, top_k=5)
    
    # doc B should rank highest (rank 2 in vector + rank 1 in bm25)
    assert fused[0]["content"] == "doc B"
    # doc A should be second (rank 1 in vector + rank 3 in bm25)
    assert fused[1]["content"] == "doc A"
    # doc C and D follow
    contents = [r["content"] for r in fused]
    assert "doc C" in contents
    assert "doc D" in contents


# Performance thresholds
PERFORMANCE_THRESHOLDS = {
    "vector_search_ms": 3000,
    "hybrid_search_ms": 5000,
    "reference_search_ms": 3000,
    "mixed_search_ms": 4000,
    "rerank_ms": 2000,
    "full_rag_ms": 8000,
}


if __name__ == "__main__":
    # Run tests manually if needed
    pytest.main([__file__, "-v", "-x"])