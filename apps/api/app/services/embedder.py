"""Embedder Service — sinh vector embedding cho RAG (chunk retrieval).

Gọi trực tiếp Google Generative Language API (gemini-embedding-001),
thay thế gateway local port 20128. Không tải model cục bộ, dùng API key Google.

Dim ép xuống 1024 qua param `outputDimensionality` để khớp `vector(1024)` trong
migration rag0000000002 (pgvector HNSW chỉ index <=2000 dim).

LƯU Ý: Google khi ép outputDimensionality KHÔNG L2-normalize vector (norm ~0.63),
nên service tự chuẩn hóa trước khi return để pgvector cosine similarity đúng.
"""
import asyncio
import logging
import math
import os
import re
import time

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = settings.google_embed.model or "gemini-embedding-001"
# Model embedding phải là model embedding (gemini-embedding-001 / text-embedding-004),
# KHÔNG phải model generate (gemini-3.1-flash-lite) — model generate không hỗ trợ
# batchEmbedContents (404). Nếu config trỏ model generate, fallback về embedding-001.
if "flash" in EMBEDDING_MODEL or "pro" in EMBEDDING_MODEL or "lite" in EMBEDDING_MODEL:
    EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIM = settings.google_embed.dim
BATCH_SIZE = int(os.getenv("EMBED_BATCH_SIZE", "32"))
_TIMEOUT = httpx.Timeout(60.0)
# Retry cho 429 (rate limit) / 5xx — re-index 100+ chunks dễ chạm quota free tier.
_MAX_RETRIES = 5
_BASE_DELAY = 5.0  # giây — 429 của Google thường cần chờ ~30-60s, backoff dần

_BASE = settings.google_embed.base_url.rstrip("/")
_KEY = settings.google_embed.api_key


def _l2(vec: list[float]) -> list[float]:
    """Chuẩn hóa L2 — Google trả vector chưa normalized khi ép dim."""
    n = math.sqrt(sum(x * x for x in vec))
    return [x / n for x in vec] if n else vec


async def _post_with_retry(client: httpx.AsyncClient, url: str, json_body: dict, headers: dict | None = None) -> dict:
    """POST với retry exponential backoff cho 429/5xx. Raise nếu hết retry."""
    last_exc: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        resp = await client.post(url, json=json_body, headers=headers)
        if resp.status_code == 429 or 500 <= resp.status_code < 600:
            retry_after = resp.headers.get("Retry-After")
            delay = float(retry_after) if retry_after else _BASE_DELAY * (2 ** attempt)
            logger.warning(
                "Embedder %s (attempt %s/%s) — retry in %.0fs",
                resp.status_code, attempt + 1, _MAX_RETRIES, delay,
            )
            last_exc = RuntimeError(f"Embedder HTTP {resp.status_code}: {resp.text[:200]}")
            await asyncio.sleep(delay)
            continue
        resp.raise_for_status()
        return resp.json()
    raise last_exc or RuntimeError("Embedder retries exhausted")


_DATA_URI_RE = re.compile(r"data:image/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+")


def _strip_data_uris(text: str) -> str:
    """Xóa data URI ảnh khỏi chunk text (batch 4xx thường do ảnh lỗi/giả mạo)."""
    return _DATA_URI_RE.sub("[image]", text)


def _nvidia_err(resp: httpx.Response) -> str:
    """Extract readable error from NVIDIA response (body may be JSON or empty)."""
    body = (resp.text or "").strip()
    if not body:
        return f"HTTP {resp.status_code} (empty body)"
    try:
        j = resp.json()
        return f"HTTP {resp.status_code}: {j.get('detail') or j.get('message') or body[:300]}"
    except Exception:
        return f"HTTP {resp.status_code}: {body[:300]}"


async def _embed_nvidia(
    texts: list[str], batch_size: int, request_delay: float, input_type: str = "passage"
) -> list[list[float]]:
    """Embed qua NVIDIA NIM (OpenAI-compatible /v1/embeddings).

    Model VLM trả 2048-dim L2-normalized, nhận cả text lẫn data URI ảnh; NIM
    không nhận param `dimensions` (400) nên slice 1024 phần tử đầu (matryoshka)
    rồi L2-normalize lại theo model card.

    input_type: "passage" cho chunks (index), "query" cho câu hỏi truy vấn.

    Fallback theo input khi batch bị 4xx (ảnh trong chunk không giải mã được,
    503 nếu model không có VLM serving): thử từng input một → strip data URI ảnh
    khỏi text → cuối cùng dùng model text-only (NVIDIA_EMBED_TEXT_MODEL).
    """
    cfg = settings.nvidia_embed
    vectors: list[list[float]] = []
    # NVIDIA từ chối input rỗng/blank (400 "must not be blank or empty") —
    # ZIP chunks có thể rỗng sau khi strip, thay bằng placeholder.
    safe_texts = [t if t.strip() else "(empty)" for t in texts]
    url = f"{cfg.base_url.rstrip('/')}/embeddings"
    headers = {"Authorization": f"Bearer {cfg.api_key}"}

    def _extract(resp: dict) -> list[list[float]]:
        out: list[list[float]] = []
        for item in resp["data"]:
            vec = item["embedding"][:EMBEDDING_DIM]
            if len(vec) != EMBEDDING_DIM:
                raise RuntimeError(
                    f"NVIDIA embedding dim mismatch: got {len(vec)}, expected {EMBEDDING_DIM}"
                )
            out.append(_l2(vec))
        return out

    async def _post_batch(model: str, batch: list[str]) -> list[list[float]]:
        resp = await _post_with_retry(
            client,
            url,
            {
                "input": batch,
                "model": model,
                "input_type": input_type,
                "encoding_format": "float",
                "truncate": "END",
            },
            headers=headers,
        )
        return _extract(resp)

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        last_index = len(safe_texts) - batch_size  # index bắt đầu batch cuối
        for i in range(0, len(safe_texts), batch_size):
            batch = safe_texts[i : i + batch_size]
            try:
                vectors.extend(await _post_batch(cfg.model, batch))
            except httpx.HTTPStatusError as exc:
                # 4xx không retry — degrade: thử từng input một với fallback.
                logger.warning(
                    "NVIDIA embed batch %d rejected (%s) — fallback per-input",
                    i // batch_size + 1, _nvidia_err(exc.response),
                )
                for single in batch:
                    try:
                        vectors.extend(await _post_batch(cfg.model, [single]))
                        continue
                    except httpx.HTTPStatusError:
                        pass
                    cleaned = _strip_data_uris(single)
                    if cleaned != single:
                        try:
                            vectors.extend(await _post_batch(cfg.model, [cleaned]))
                            continue
                        except httpx.HTTPStatusError:
                            pass
                        single = cleaned
                    # Cùng chót: model text-only (chấp nhận text thuần).
                    vectors.extend(await _post_batch(cfg.text_model, [single]))
            # Đủ chiều dài sau mọi nhánh (batch OK hoặc fallback) — luôn sleep
            # giữa các batch trừ batch cuối (rate limit 40 RPM).
            if request_delay > 0 and i < last_index:
                await asyncio.sleep(request_delay)
    return vectors


async def embed(
    texts: list[str], batch_size: int = BATCH_SIZE, input_type: str = "passage"
) -> list[list[float]]:
    """Embed danh sách text → list vector (mỗi vector EMBEDDING_DIM phần tử, L2-normalized).

    Args:
        texts: text cần embed (mỗi phần tử là một chunk).
        batch_size: số text gửi mỗi request batch.
        input_type: "passage" cho chunks (index), "query" cho câu truy vấn retrieval
            (chỉ NVIDIA dùng param này; Google bỏ qua).

    Returns:
        list[list[float]] — vector đã chuẩn hóa. Trả [] nếu `texts` rỗng.

    Raises:
        RuntimeError: endpoint lỗi, format response lạ, hoặc dim lệch EMBEDDING_DIM.
    """
    if not texts:
        return []

    vectors: list[list[float]] = []
    request_delay = float(os.getenv("EMBED_REQUEST_DELAY", "1.5"))  # delay between batches
    if settings.nvidia_embed.api_key:
        return await _embed_nvidia(texts, batch_size, request_delay, input_type)
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
            resp = await _post_with_retry(
                client,
                f"{_BASE}/{EMBEDDING_MODEL}:batchEmbedContents?key={_KEY}",
                {"requests": reqs},
            )
            data = resp
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
            # Rate-limit: delay between batches to avoid 429
            if request_delay > 0 and i + batch_size < len(texts):
                await asyncio.sleep(request_delay)
    return vectors