"""
Gemini 3.1 Flash Lite Vision Reader — Unified OCR/Text + diagram extraction.

Stage 5 (Option B): multimodal extraction.
- PDF: send whole file as inline_data; Gemini renders embedded images natively.
- DOCX/PPTX: Gemini CANNOT render images embedded in OOXML when the whole file is
  sent (it only reads document.xml text). So we unzip the office file, extract the
  embedded raster images, and send EACH as a separate `image/*` part alongside the
  native text as context. Gemini then "sees" every diagram/figure and describes it.

Returns structured JSON: {"text": str, "diagrams": List[str]}

Features:
- Token bucket rate limiter (15 RPM)
- SHA256 hash-based cache (in-memory, can swap to Redis later)
- Retries with exponential backoff for 429/5xx
- Structured output via responseMimeType=application/json
- Public API: `read_file(bytes, mime_type, *, images=None, body_text=None) ->
  ReadResult(text, diagrams)`
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class ReadResult:
    """Structured output from vision reader."""
    text: str
    diagrams: list[str]


@dataclass
class ImagePart:
    """An embedded raster image to send as a multimodal part to Gemini."""
    data: bytes
    mime_type: str


# ---------------------------------------------------------------------------
# Rate Limiter — Token Bucket (15 RPM)
# ---------------------------------------------------------------------------


@dataclass
class TokenBucket:
    """Simple async token bucket. Not distributed — single process is fine for API pod."""

    rate_per_minute: int = 15
    _tokens: float = field(init=False, default=15.0)
    _last: float = field(init=False, default_factory=time.monotonic)
    _lock: asyncio.Lock = field(init=False, default_factory=asyncio.Lock)

    async def take(self) -> None:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last
            self._tokens = min(self.rate_per_minute, self._tokens + elapsed * self.rate_per_minute / 60.0)
            if self._tokens >= 1:
                self._tokens -= 1
                self._last = now
                return
            wait_s = (1 - self._tokens) * 60.0 / self.rate_per_minute
            self._tokens = 0
            self._last = now + wait_s
        await asyncio.sleep(wait_s)


_rate_limiter = TokenBucket(rate_per_minute=15)


# ---------------------------------------------------------------------------
# Cache — In-memory dict keyed by SHA256(file_bytes)
# ---------------------------------------------------------------------------
_cache: dict[str, ReadResult] = {}


def _cache_key(data: bytes, images=None, body_text=None) -> str:
    """Cache key covers file bytes + embedded images + body text."""
    h = hashlib.sha256(data)
    if images:
        for im in images:
            h.update(im.data)
    if body_text:
        h.update(body_text.encode("utf-8", "replace"))
    return "vision:" + h.hexdigest()


# ---------------------------------------------------------------------------
# Core Vision Call
# ---------------------------------------------------------------------------

_VISION_PROMPT = (
    "Read this document completely. Extract ALL visible text (headings, body, tables, "
    "captions). For each diagram, chart, figure, ERD, DFD, sequence or flow diagram, "
    "write a detailed textual description of what it shows (entities, relationships, "
    "steps, labels). Respond ONLY with JSON matching this schema: "
    '{"text": "<all extracted text>", "diagrams": ["<description of diagram 1>", ...]}. '
    "If there are no diagrams, return empty array."
)

# Office path: the document text is supplied by the caller (native extractor) as
# context/captions. Gemini only needs to DESCRIBE each embedded image. We keep the
# `text` field empty to avoid making Gemini echo tens of thousands of chars back.
_VISION_PROMPT_OFFICE = (
    "You are analyzing a document. The first text block is the document's extracted "
    "text (it includes figure captions such as 'Figure 1: Context diagram'). The "
    "following image blocks are the embedded figures/diagrams from that document. "
    "For EACH image, write a detailed description: identify its type (ERD, DFD, "
    "sequence, use-case, flow, UI screen, or photo) and describe the entities, "
    "relationships, arrows, steps and labels it contains. Respond ONLY with JSON "
    'matching this schema: {"text": "", "diagrams": ["<description of image 1>", ...]}. '
    "The 'text' field MUST be empty. If an image is not a meaningful diagram, still "
    "describe it briefly. Return an empty array only if there are truly no images."
)


async def _call_gemini_vision(
    file_bytes: bytes,
    mime_type: str,
    *,
    images: list[ImagePart] | None = None,
    body_text: str | None = None,
    max_retries: int = 3,
) -> ReadResult:
    """Call Gemini 3.1 Flash Lite, returns structured {text, diagrams}.

    Two modes:
    - PDF (images is None): send whole file as inline_data; Gemini extracts text + diagrams.
    - Office (images provided): send each embedded image as an image part + body_text as
      context; Gemini describes each image (diagrams). text is supplied by the caller.
    """
    api_key = settings.google_embed.api_key
    base_url = settings.google_embed.base_url or "https://generativelanguage.googleapis.com/v1beta/models"
    model_name = settings.google_embed.model or "gemini-3.1-flash-lite"
    url = f"{base_url}/{model_name}:generateContent"

    parts: list[dict] = []
    if images:
        # Office path: each embedded image is a separate multimodal part; native text
        # is supplied as context so Gemini can match captions to figures.
        for im in images:
            parts.append({
                "inline_data": {
                    "mime_type": im.mime_type,
                    "data": base64.b64encode(im.data).decode(),
                }
            })
        if body_text:
            parts.append({
                "text": "DOCUMENT TEXT (context / figure captions):\n" + body_text[:200_000]
            })
        parts.append({"text": _VISION_PROMPT_OFFICE})
    else:
        # PDF path: Gemini renders images natively from the whole file.
        b64 = base64.b64encode(file_bytes).decode()
        parts.append({"inline_data": {"mime_type": mime_type, "data": b64}})
        parts.append({"text": _VISION_PROMPT})

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 8192,
            "responseMimeType": "application/json",
        },
    }

    headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=120.0) as client:
        for attempt in range(max_retries):
            await _rate_limiter.take()
            try:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code == 429:
                    retry_after = int(resp.headers.get("Retry-After", "60"))
                    logger.warning("Gemini 429, backing off %ss (attempt %s/%s)", retry_after, attempt + 1, max_retries)
                    await asyncio.sleep(retry_after)
                    continue
                if 500 <= resp.status_code < 600:
                    wait = 2 ** attempt
                    logger.warning("Gemini %s, retry in %ss (attempt %s/%s)", resp.status_code, wait, attempt + 1, max_retries)
                    await asyncio.sleep(wait)
                    continue
                resp.raise_for_status()
                data = resp.json()
                candidates = data.get("candidates", [])
                if not candidates:
                    logger.error("Gemini empty candidates: %s", data)
                    return ReadResult(text="", diagrams=[])
                parts = candidates[0].get("content", {}).get("parts", [])
                raw = "".join(p.get("text", "") for p in parts).strip()
                return _parse_vision_json(raw)
            except httpx.TimeoutException:
                logger.warning("Gemini timeout (attempt %s/%s)", attempt + 1, max_retries)
                await asyncio.sleep(2 ** attempt)
            except Exception as exc:
                logger.exception("Gemini vision call failed: %s", exc)
                if attempt == max_retries - 1:
                    raise
                await asyncio.sleep(2 ** attempt)
    return ReadResult(text="", diagrams=[])


def _parse_vision_json(raw: str) -> ReadResult:
    """Parse Gemini JSON response into ReadResult; fallback to plain text."""
    try:
        obj = json.loads(raw)
        text = obj.get("text", "") or ""
        diagrams = obj.get("diagrams", []) or []
        if isinstance(diagrams, str):
            diagrams = [diagrams]
        return ReadResult(text=text.strip(), diagrams=[d.strip() for d in diagrams if d and d.strip()])
    except (json.JSONDecodeError, AttributeError):
        # Model ignored schema — treat whole thing as text, no diagrams
        logger.warning("Gemini did not return valid JSON; treating as plain text")
        return ReadResult(text=raw, diagrams=[])


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def read_file(
    file_bytes: bytes,
    mime_type: str,
    *,
    images: list[ImagePart] | None = None,
    body_text: str | None = None,
    use_cache: bool = True,
) -> ReadResult:
    """Extract text + diagram descriptions via Gemini 3.1 Flash Lite.

    Args:
        file_bytes: raw file bytes (used for cache key + PDF path).
        mime_type: MIME type of the file.
        images: embedded raster images (DOCX/PPTX path). Each sent as a multimodal part.
        body_text: native-extracted text used as context for the office path. When
            provided, it becomes the authoritative `text` in the result (Gemini only
            describes the images), avoiding echoing tens of thousands of chars back.
        use_cache: cache the result keyed by file + images + body_text.
    """
    if not file_bytes and not images:
        return ReadResult(text="", diagrams=[])

    key = _cache_key(file_bytes, images, body_text)
    if use_cache and key in _cache:
        logger.debug("Vision cache hit: %s", key[:16])
        return _cache[key]

    logger.info(
        "Vision reading %s bytes (%s)%s via Gemini 3.1 Flash Lite",
        len(file_bytes), mime_type, f" + {len(images)} images" if images else "",
    )
    result = await _call_gemini_vision(
        file_bytes, mime_type, images=images, body_text=body_text
    )

    # Office path: native text is authoritative; Gemini only described the images.
    if body_text is not None:
        result = ReadResult(text=body_text, diagrams=result.diagrams)

    if use_cache:
        _cache[key] = result
        logger.debug("Vision cached: %s (%d chars, %d diagrams)", key[:16], len(result.text), len(result.diagrams))

    return result


def clear_cache() -> None:
    """Clear vision cache (for testing)."""
    _cache.clear()


def cache_stats() -> dict:
    """Return cache statistics."""
    return {
        "entries": len(_cache),
        "total_chars": sum(len(v.text) for v in _cache.values()),
        "total_diagrams": sum(len(v.diagrams) for v in _cache.values()),
    }