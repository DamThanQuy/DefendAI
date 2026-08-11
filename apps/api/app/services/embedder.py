"""Embedder Service — sinh vector embedding cho RAG (chunk retrieval).

Gọi trực tiếp Google Generative Language API (gemini-embedding-001),
thay thế gateway local port 20128. Không tải model cục bộ, dùng API key Google.

Dim ép xuống 1024 qua param `outputDimensionality` để khớp `vector(1024)` trong
migration rag0000000002 (pgvector HNSW chỉ index <=2000 dim).

LƯU Ý: Google khi ép outputDimensionality KHÔNG L2-normalize vector (norm ~0.63),
nên service tự chuẩn hóa trước khi return để pgvector cosine similarity đúng.
"""
import logging
import math
import os

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = settings.google_embed.model
EMBEDDING_DIM = settings.google_embed.dim
BATCH_SIZE = int(os.getenv("EMBED_BATCH_SIZE", "32"))
_TIMEOUT = httpx.Timeout(60.0)

_BASE = settings.google_embed.base_url.rstrip("/")
_KEY = settings.google_embed.api_key


def _l2(vec: list[float]) -> list[float]:
    """Chuẩn hóa L2 — Google trả vector chưa normalized khi ép dim."""
    n = math.sqrt(sum(x * x for x in vec))
    return [x / n for x in vec] if n else vec


async def embed(texts: list[str], batch_size: int = BATCH_SIZE) -> list[list[float]]:
    """Embed danh sách text → list vector (mỗi vector EMBEDDING_DIM phần tử, L2-normalized).

    Args:
        texts: text cần embed (mỗi phần tử là một chunk).
        batch_size: số text gửi mỗi request batch.

    Returns:
        list[list[float]] — vector đã chuẩn hóa. Trả [] nếu `texts` rỗng.

    Raises:
        RuntimeError: endpoint lỗi, format response lạ, hoặc dim lệch EMBEDDING_DIM.
    """
    if not texts:
        return []

    vectors: list[list[float]] = []
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        # Batch qua batchEmbedContents (mỗi request cần field model)
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            reqs = [
                {
                    "model": f"models/{EMBEDDING_MODEL}",
                    "content": {"parts": [{"text": t}]},
                    "outputDimensionality": EMBEDDING_DIM,
                }
                for t in batch
            ]
            resp = await client.post(
                f"{_BASE}/{EMBEDDING_MODEL}:batchEmbedContents?key={_KEY}",
                json={"requests": reqs},
            )
            resp.raise_for_status()
            data = resp.json()
            try:
                items = data["embeddings"]
            except (KeyError, TypeError) as exc:
                raise RuntimeError(f"Unexpected embeddings response: {data}") from exc
            for item in items:
                vec = item["values"]
                if len(vec) != EMBEDDING_DIM:
                    raise RuntimeError(
                        f"Embedding dim mismatch: got {len(vec)}, "
                        f"expected {EMBEDDING_DIM} (model {EMBEDDING_MODEL})"
                    )
                vectors.append(_l2(vec))
    return vectors