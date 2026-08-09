"""
Embedder Service — sinh vector embedding cho RAG (chunk retrieval).

Gọi OpenAI-compatible `/v1/embeddings` qua local endpoint (Gemini server,
port 20128) thay vì sentence-transformers: không tải model cục bộ, 0 phí API ngoài.

Model: gemini/gemini-embedding-001 via local 9router endpoint (port 20128). Dim ép xuống
1024 qua param `dimensions` (proxy hỗ trợ OpenAI-compat) — < 2000 để HNSW index của
pgvector hoạt động (pgvector chặn index với vector > 2000 dim). Khớp `vector(1024)` trong
migration rag0000000002.
"""
import logging
import os
from typing import List

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "gemini/gemini-embedding-001"
EMBEDDING_DIM = 1024  # vì pgvector hnsw/ivfflat chỉ index ≤ 2000 dim
BATCH_SIZE = int(os.getenv("EMBED_BATCH_SIZE", "32"))
_TIMEOUT = httpx.Timeout(600.0)


async def embed(texts: List[str], batch_size: int = BATCH_SIZE) -> List[List[float]]:
    """Embed danh sách text → list vector (mỗi vector EMBEDDING_DIM phần tử).

    Args:
        texts: text cần embed (mỗi phần tử là một chunk).
        batch_size: số text gửi mỗi request (mặc định 32).

    Returns:
        list[list[float]] — vector đã có từ API (Gemini trả L2-normalized sẵn).
        Trả về [] nếu `texts` rỗng.

    Raises:
        RuntimeError: endpoint lỗi, format response lạ, hoặc dim lệch EMBEDDING_DIM.
    """
    if not texts:
        return []

    vectors: List[List[float]] = []
    headers = {
        "Authorization": f"Bearer {settings.local.api_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            resp = await client.post(
                f"{settings.local.base_url}/embeddings",
                headers=headers,
                json={"model": EMBEDDING_MODEL, "input": batch, "dimensions": EMBEDDING_DIM},
            )
            resp.raise_for_status()
            data = resp.json()
            try:
                items = sorted(data["data"], key=lambda x: x["index"])
            except (KeyError, TypeError) as exc:
                raise RuntimeError(f"Unexpected embeddings response: {data}") from exc
            for item in items:
                vec = item["embedding"]
                if len(vec) != EMBEDDING_DIM:
                    raise RuntimeError(
                        f"Embedding dim mismatch: got {len(vec)}, "
                        f"expected {EMBEDDING_DIM} (model {EMBEDDING_MODEL})"
                    )
                vectors.append(vec)
    return vectors
