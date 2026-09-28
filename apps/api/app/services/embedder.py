"""Embedder Service — sinh vector embedding cho RAG (chunk retrieval).

Gọi trực tiếp Google Generative Language API (gemini-embedding-001),
thay thế gateway local port 20128. Không tải model cục mặt, dùng API key Google.

Dim ép xuống 1024 qua param `outputDimensionality` để khớp `vector(1024)` trong
migration rag0000000002 (pgvector HNSW chỉ index <=2000 dim).

LƯU Ý: Google khi ép outputDimensionality KHÔNG L2-normalize vector (norm ~0.63),
nên service tự chuẩn hóa trước khi return để pgvector cosine similarity đúng.

DB-driven: provider/model/api_key/base_url được lấy từ feature_ai_config (feature='embedding')
+ bảng ai_providers. Env (GOOGLE_EMBED_*, NVIDIA_EMBED_*) chỉ là fallback khi DB chưa có.
"""
import asyncio
import logging
import math
import os
import re
import time
from collections.abc import Awaitable, Callable
from typing import Any, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# EMBEDDING_DIM luôn cố định = 1024 để khớp cột vector(1024) của pgvector.
EMBEDDING_DIM = 1024

BATCH_SIZE = int(os.getenv("EMBED_BATCH_SIZE", "64"))
_TIMEOUT = httpx.Timeout(60.0)
# Retry cho 429 (rate limit) / 5xx — re-index 100+ chunks dễ chạm quota free tier.
_MAX_RETRIES = 5
_BASE_DELAY = 5.0  # giây — 429 của Google thường cần chờ ~30-60s, backoff dần

# --- Env fallback config (chỉ dùng khi DB chưa có provider enabled) ---
_FALLBACK_GOOGLE_MODEL = settings.google_embed.model or "gemini-embedding-001"
if any(k in _FALLBACK_GOOGLE_MODEL for k in ("flash", "pro", "lite")):
    _FALLBACK_GOOGLE_MODEL = "gemini-embedding-001"
_FALLBACK_GOOGLE_BASE = settings.google_embed.base_url.rstrip("/")
_FALLBACK_GOOGLE_KEY = settings.google_embed.api_key
_FALLBACK_NVIDIA_KEY = settings.nvidia_embed.api_key
_FALLBACK_NVIDIA_BASE = settings.nvidia_embed.base_url.rstrip("/")
_FALLBACK_NVIDIA_MODEL = settings.nvidia_embed.model
_FALLBACK_NVIDIA_TEXT_MODEL = settings.nvidia_embed.text_model

# EMBEDDING_MODEL giữ để backward-compat (analysis_pipeline lưu model name vào DB).
# Model thực tế được resolve động từ DB qua _load_embedding_config().
EMBEDDING_MODEL = _FALLBACK_GOOGLE_MODEL

# Cache resolved config để tránh query DB mỗi lần embed (TTL ngắn).
# Invalidate khi admin thay đổi config qua invalidate_cache().
_embedding_cfg: Optional[dict[str, Any]] = None
_embedding_cfg_expires: float = 0.0
_CFG_TTL = 30.0  # giây — cùng TTL với feature_ai cache


def invalidate_cache() -> None:
    """Clear cache embedding config — gọi khi admin mutation (PUT/DELETE provider/model)."""
    global _embedding_cfg
    _embedding_cfg = None


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


async def _load_embedding_config(db=None) -> dict[str, Any]:
    """Resolve embedding config từ DB (feature_ai_config + ai_providers).

    Fallback chain:
    1. DB feature_ai_config (feature='embedding') — nếu có provider + model + api_key + base_url.
    2. Env NVIDIA_EMBED_* — nếu có key.
    3. Env GOOGLE_EMBED_* — fallback cuối.
    """
    from sqlalchemy import select
    from app.core.database import async_session_maker
    from app.models.ai_config import AIProvider, FeatureAIConfig
    from app.services.feature_ai import resolve_feature_ai

    # Thử DB
    try:
        if db is not None:
            provider, model = await resolve_feature_ai(db, "embedding")
        else:
            async with async_session_maker() as session:
                provider, model = await resolve_feature_ai(session, "embedding")
        if provider and model:
            # Lấy api_key + base_url từ AIProvider
            if db is not None:
                prov = (await db.execute(
                    select(AIProvider).where(AIProvider.name == provider)
                )).scalar_one_or_none()
            else:
                async with async_session_maker() as session:
                    prov = (await session.execute(
                        select(AIProvider).where(AIProvider.name == provider)
                    )).scalar_one_or_none()
            if prov and prov.api_key and prov.base_url:
                return {
                    "provider_type": "nvidia" if "nvidia" in provider.lower() else "google",
                    "provider": provider,
                    "model": model,
                    "api_key": prov.api_key,
                    "base_url": prov.base_url.rstrip("/"),
                    "text_model": getattr(settings.nvidia_embed, "text_model", "nvidia/nemotron-3-embed-1b"),
                }
    except Exception as e:
        logger.warning("_load_embedding_config: DB resolve failed (%s), fallback env", e)

    # Fallback env
    if _FALLBACK_NVIDIA_KEY:
        return {
            "provider_type": "nvidia",
            "provider": "nvidia",
            "model": _FALLBACK_NVIDIA_MODEL,
            "api_key": _FALLBACK_NVIDIA_KEY,
            "base_url": _FALLBACK_NVIDIA_BASE,
            "text_model": _FALLBACK_NVIDIA_TEXT_MODEL,
        }
    return {
        "provider_type": "google",
        "provider": "google",
        "model": _FALLBACK_GOOGLE_MODEL,
        "api_key": _FALLBACK_GOOGLE_KEY,
        "base_url": _FALLBACK_GOOGLE_BASE,
        "text_model": "",
    }


async def get_embedding_effective_config(db=None) -> dict[str, Any]:
    """Lấy config embedding có cache (TTL 30s), refresh khi cache expired."""
    global _embedding_cfg, _embedding_cfg_expires
    now = time.monotonic()
    if _embedding_cfg is not None and _embedding_cfg_expires > now:
        return _embedding_cfg
    _embedding_cfg = await _load_embedding_config(db)
    _embedding_cfg_expires = now + _CFG_TTL
    return _embedding_cfg


async def _embed_nvidia(
    texts: list[str],
    batch_size: int,
    request_delay: float,
    api_key: str,
    base_url: str,
    model: str,
    text_model: str,
    input_type: str = "passage",
    on_progress: Callable[[int, int], Awaitable[None]] | None = None,
) -> list[list[float]]:
    """Embed qua NVIDIA NIM (OpenAI-compatible /v1/embeddings).

    Model VLM trả 2048-dim L2-normalized, nhận cả text lẫn data URI ảnh; NIM
    không nhận param `dimensions` (400) nên slice 1024 phần tử đầu (matryoshka)
    rồi L2-normalize lại theo model card.

    input_type: "passage" cho chunks (index), "query" cho câu hỏi truy vấn.

    Fallback theo input khi batch bị 4xx (ảnh trong chunk không giải mã được,
    503 nếu model không có VLM serving): thử từng input một → strip data URI ảnh
    khỏi text → cuối cùng dùng model text-only (text_model).
    """
    vectors: list[list[float]] = []
    # NVIDIA từ chối input rỗng/blank (400 "must not be blank or empty") —
    # ZIP chunks có thể rỗng sau khi strip, thay bằng placeholder.
    safe_texts = [t if t.strip() else "(empty)" for t in texts]
    url = f"{base_url.rstrip('/')}/embeddings"
    headers = {"Authorization": f"Bearer {api_key}"}

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

    async def _post_batch(model_name: str, batch: list[str]) -> list[list[float]]:
        resp = await _post_with_retry(
            client,
            url,
            {
                "input": batch,
                "model": model_name,
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
                vectors.extend(await _post_batch(model, batch))
            except httpx.HTTPStatusError as exc:
                # 4xx không retry — degrade: thử từng input một với fallback.
                logger.warning(
                    "NVIDIA embed batch %d rejected (%s) — fallback per-input",
                    i // batch_size + 1, _nvidia_err(exc.response),
                )
                for single in batch:
                    try:
                        vectors.extend(await _post_batch(model, [single]))
                        continue
                    except httpx.HTTPStatusError:
                        pass
                    cleaned = _strip_data_uris(single)
                    if cleaned != single:
                        try:
                            vectors.extend(await _post_batch(model, [cleaned]))
                            continue
                        except httpx.HTTPStatusError:
                            pass
                        single = cleaned
                    # Cùng chót: model text-only (chấp nhận text thuần).
                    vectors.extend(await _post_batch(text_model, [single]))
            # Đủ chiều dài sau mọi nhánh (batch OK hoặc fallback) — luôn sleep
            # giữa các batch trừ batch cuối (rate limit 40 RPM).
            if request_delay > 0 and i < last_index:
                await asyncio.sleep(request_delay)
            if on_progress is not None:
                try:
                    await on_progress(min(i + batch_size, len(safe_texts)), len(safe_texts))
                except Exception as exc:  # noqa: BLE001
                    logger.warning("embed on_progress callback failed: %s", exc)
    return vectors


async def _embed_google(
    texts: list[str],
    batch_size: int,
    request_delay: float,
    api_key: str,
    base_url: str,
    model: str,
    input_type: str = "passage",
    on_progress: Callable[[int, int], Awaitable[None]] | None = None,
) -> list[list[float]]:
    """Embed qua Google Generative Language API (batchEmbedContents)."""
    vectors: list[list[float]] = []
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        last_index = len(texts) - batch_size
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            reqs = [
                {
                    "model": f"models/{model}",
                    "content": {"parts": [{"text": t}]},
                    "outputDimensionality": EMBEDDING_DIM,
                }
                for t in batch
            ]
            resp = await _post_with_retry(
                client,
                f"{base_url.rstrip('/')}/{model}:batchEmbedContents?key={api_key}",
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
                        f"expected {EMBEDDING_DIM} (model {model})"
                    )
                vectors.append(_l2(vec))
            if request_delay > 0 and i < last_index:
                await asyncio.sleep(request_delay)
            if on_progress is not None:
                try:
                    await on_progress(min(i + batch_size, len(texts)), len(texts))
                except Exception as exc:  # noqa: BLE001
                    logger.warning("embed on_progress callback failed: %s", exc)
    return vectors


async def embed(
    texts: list[str],
    batch_size: int = BATCH_SIZE,
    input_type: str = "passage",
    on_progress: Callable[[int, int], Awaitable[None]] | None = None,
    db=None,
) -> list[list[float]]:
    """Embed danh sách text → list vector (mỗi vector EMBEDDING_DIM phần tử, L2-normalized).

    Args:
        texts: text cần embed (mỗi phần tử là một chunk).
        batch_size: số text gửi mỗi request batch.
        input_type: "passage" cho chunks (index), "query" cho câu truy vấn retrieval
            (chỉ NVIDIA dùng param này; Google bỏ qua).
        on_progress: callback async (done_texts, total_texts) gọi sau mỗi batch —
            cho phép caller cập nhật progress job thay vì đứng yên giữa chừng.
        db: optional AsyncSession — nếu có, dùng để resolve config từ DB.

    Returns:
        list[list[float]] — vector đã chuẩn hóa. Trả [] nếu `texts` rỗng.

    Raises:
        RuntimeError: endpoint lỗi, format response lạ, hoặc dim lệch EMBEDDING_DIM.
    """
    if not texts:
        return []

    request_delay = float(os.getenv("EMBED_REQUEST_DELAY", "1.5"))  # delay between batches

    cfg = await get_embedding_effective_config(db)
    if cfg["provider_type"] == "nvidia":
        return await _embed_nvidia(
            texts, batch_size, request_delay,
            api_key=cfg["api_key"], base_url=cfg["base_url"],
            model=cfg["model"], text_model=cfg["text_model"],
            input_type=input_type, on_progress=on_progress,
        )
    return await _embed_google(
        texts, batch_size, request_delay,
        api_key=cfg["api_key"], base_url=cfg["base_url"],
        model=cfg["model"], input_type=input_type, on_progress=on_progress,
    )


async def test_embedding_dim(db=None) -> dict[str, Any]:
    """Probe 1 request embedding để validate dim == EMBEDDING_DIM (admin test endpoint).

    Gửi text ngắn lên provider/model được resolve từ DB (fallback env).
    Trả về ok=True nếu dim đúng, ok=False + chi tiết lỗi nếu sai.

    Args:
        db: optional AsyncSession.
    """
    probe_text = "test embedding dimension validation"
    try:
        cfg = await _load_embedding_config(db)
        if not cfg["api_key"]:
            return {"ok": False, "detail": "API key rỗng — chưa cấu hình provider"}
        if cfg["provider_type"] == "nvidia":
            vecs = await _embed_nvidia(
                [probe_text], 1, 0.0,
                api_key=cfg["api_key"], base_url=cfg["base_url"],
                model=cfg["model"], text_model=cfg["text_model"],
                input_type="passage",
            )
        else:
            vecs = await _embed_google(
                [probe_text], 1, 0.0,
                api_key=cfg["api_key"], base_url=cfg["base_url"],
                model=cfg["model"],
            )
        if not vecs:
            return {"ok": False, "detail": "Empty response — không nhận được vector"}
        dim = len(vecs[0])
        if dim != EMBEDDING_DIM:
            return {
                "ok": False,
                "detail": f"Dim sai: model trả về {dim}, cần {EMBEDDING_DIM}. "
                          f"Provider={cfg['provider']} model={cfg['model']}",
                "received_dim": dim,
                "expected_dim": EMBEDDING_DIM,
            }
        return {
            "ok": True,
            "detail": f"OK — {dim}-dim vector từ {cfg['provider']}/{cfg['model']}",
            "received_dim": dim,
            "expected_dim": EMBEDDING_DIM,
            "provider": cfg["provider"],
            "model": cfg["model"],
        }
    except httpx.HTTPStatusError as e:
        import re as _re
        body = (e.response.text or "").strip()[:300]
        # Cố gắng extract message từ JSON error body
        try:
            j = e.response.json()
            msg = j.get("error", {}).get("message") or j.get("detail") or j.get("message") or body[:300]
        except Exception:
            msg = body
        return {
            "ok": False,
            "detail": f"HTTP {e.response.status_code}: {msg}",
            "received_dim": 0,
            "expected_dim": EMBEDDING_DIM,
        }
    except Exception as e:
        return {"ok": False, "detail": repr(e)[:300], "received_dim": 0, "expected_dim": EMBEDDING_DIM}
