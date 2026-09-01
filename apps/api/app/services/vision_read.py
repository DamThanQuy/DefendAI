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
import re
import time
from dataclasses import dataclass, field
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class DiagramInfo:
    """Mô tả 1 figure từ vision reader, có khoá figure để merge không phụ thuộc thứ tự."""
    figure: Optional[int]      # số hiệu "Figure N" nếu ảnh gửi kèm caption có số
    kind: str                  # diagram | screen | photo | unknown
    caption: str               # caption gốc của ảnh (rỗng nếu không có)
    description: str           # mô tả chi tiết của Gemini


@dataclass
class ReadResult:
    """Structured output from vision reader.

    `diagrams` giữ list[str] để tương thích ngược (mọi consumer cũ chỉ đọc text
    mô tả). `diagram_infos` là bản có cấu trúc (Fix C) — figure/kind/caption.
    """
    text: str
    diagrams: list[str]
    diagram_infos: list[DiagramInfo] = field(default_factory=list)


@dataclass
class ImagePart:
    """An embedded raster image to send as a multimodal part to Gemini.

    `label` (tuỳ chọn): text đặt NGAY TRƯỚC ảnh trong request, vd
    "Figure 42: Withdraw request detail screen" — giúp Gemini echo số figure
    trở lại và merge không phụ thuộc thứ tự (Fix A/B).
    """
    data: bytes
    mime_type: str
    label: Optional[str] = None


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
# Each image arrives already labelled with its own caption (Fix A inventory), so
# the model must echo the figure number back — merging by number is order-safe.
_VISION_PROMPT_OFFICE = (
    "You are analyzing figures from a document. Each image below is preceded by a "
    "text label identifying it (e.g. \"Figure 42: Withdraw request detail screen\"). "
    "For EACH image, write a detailed description: identify its type (ERD, DFD, "
    "sequence, use-case, flow diagram, UI screen, or photo) and describe the "
    "entities, relationships, arrows, steps, fields and labels it contains. "
    "Respond ONLY with JSON matching this schema: "
    '{"text": "", "diagrams": [{"figure": <number from the label, or null>, '
    '"kind": "diagram|screen|photo", "caption": "<label text>", '
    '"description": "<your description>"}, ...]}. '
    "The 'text' field MUST be empty. Describe EVERY image you were given, in the "
    "same order. If an image is not a meaningful diagram, still describe it "
    "briefly. Return an empty array only if there are truly no images."
)


async def _call_gemini_vision_once(
    file_bytes: bytes,
    mime_type: str,
    *,
    images: list[ImagePart] | None = None,
    body_text: str | None = None,
    max_output_tokens: int = 8192,
    max_retries: int = 3,
) -> tuple[ReadResult, bool]:
    """One Gemini request. Returns (result, truncated).

    truncated=True khi model chạm maxOutputTokens (finishReason=LENGTH) — caller
    phải chia batch nhỏ hơn / tăng token thay vì nhận JSON cụt (Fix F).
    """
    api_key = settings.google_embed.api_key
    base_url = settings.google_embed.base_url or "https://generativelanguage.googleapis.com/v1beta/models"
    model_name = settings.google_embed.model or "gemini-3.1-flash-lite"
    url = f"{base_url}/{model_name}:generateContent"

    parts: list[dict] = []
    if images:
        # Office path: mỗi ảnh là 1 multimodal part, NGAY TRƯỚC nó là text label
        # chứa caption của chính ảnh (image.label do inventory đặt — Fix A).
        for im in images:
            if getattr(im, "label", None):
                parts.append({"text": im.label})
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
            "maxOutputTokens": max_output_tokens,
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
                    return ReadResult(text="", diagrams=[]), False
                cand = candidates[0]
                finish = cand.get("finishReason", "")
                parts = cand.get("content", {}).get("parts", [])
                raw = "".join(p.get("text", "") for p in parts).strip()
                truncated = finish == "LENGTH"
                if truncated:
                    logger.warning(
                        "Gemini response truncated at %d output tokens (finishReason=LENGTH)",
                        max_output_tokens,
                    )
                return _parse_vision_json(raw), truncated
            except httpx.TimeoutException:
                logger.warning("Gemini timeout (attempt %s/%s)", attempt + 1, max_retries)
                await asyncio.sleep(2 ** attempt)
            except Exception as exc:
                logger.exception("Gemini vision call failed: %s", exc)
                if attempt == max_retries - 1:
                    raise
                await asyncio.sleep(2 ** attempt)
    return ReadResult(text="", diagrams=[]), True


def _parse_vision_json(raw: str) -> ReadResult:
    """Parse Gemini JSON response into ReadResult; fallback to plain text.

    Hỗ trợ cả 2 shape của `diagrams`:
    - list[str] (PDF path / model cũ) → DiagramInfo(kind=unknown).
    - list[dict] (office path, Fix C) → {figure, kind, caption, description}.
    """
    try:
        obj = json.loads(raw)
        text = obj.get("text", "") or ""
        diagrams = obj.get("diagrams", []) or []
        if isinstance(diagrams, str):
            diagrams = [diagrams]
        infos: list[DiagramInfo] = []
        for d in diagrams:
            if isinstance(d, dict):
                desc = (d.get("description") or "").strip()
                if not desc:
                    continue
                fig = d.get("figure")
                infos.append(DiagramInfo(
                    figure=int(fig) if isinstance(fig, (int, float)) else None,
                    kind=(d.get("kind") or "unknown").strip().lower(),
                    caption=(d.get("caption") or "").strip(),
                    description=desc,
                ))
            elif isinstance(d, str) and d.strip():
                infos.append(DiagramInfo(figure=None, kind="unknown", caption="", description=d.strip()))
        return ReadResult(text=text.strip(), diagrams=[i.description for i in infos], diagram_infos=infos)
    except (json.JSONDecodeError, AttributeError):
        # Model ignored schema — treat whole thing as text, no diagrams
        logger.warning("Gemini did not return valid JSON; treating as plain text")
        return ReadResult(text=raw, diagrams=[])


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

# Số ảnh mỗi request vision (batch). 8-12 là điểm ngọt: payload < 20MB inline,
# output ~150 token/ảnh mô tả → 12 ảnh ≈ 2000 token, không chạm ceiling.
VISION_BATCH_SIZE = 10
# Token output mỗi batch — đủ cho 10 mô tả chi tiết.
VISION_BATCH_MAX_TOKENS = 6000
# Số lần chia đôi batch khi vẫn bị cắt (Fix F).
VISION_MAX_SPLIT_DEPTH = 3
# Giới hạn song song — rate limiter 15 RPM đã có, semaphore tránh bão request.
_VISION_CONCURRENCY = 2


async def read_file(
    file_bytes: bytes,
    mime_type: str,
    *,
    images: list[ImagePart] | None = None,
    body_text: str | None = None,
    use_cache: bool = True,
) -> ReadResult:
    """Extract text + diagram descriptions via Gemini 3.1 Flash Lite.

    Office path (images provided): ảnh được chia batch (Fix B) — mỗi batch gửi
    song song (Semaphore 2), mỗi ảnh kèm label caption; batch nào bị cắt
    (finishReason=LENGTH) sẽ chia đôi đệ quy đến khi đủ nhỏ (Fix F). Kết quả
    merge theo `figure` number, không phụ thuộc thứ tự trả về.

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

    if images:
        result = await _read_office_batched(images, body_text)
        # text luôn lấy từ native extractor (authoritative) — Gemini chỉ mô tả ảnh.
        result = ReadResult(text=(body_text or ""), diagrams=result.diagrams,
                            diagram_infos=result.diagram_infos)
    else:
        result, truncated = await _call_gemini_vision_once(
            file_bytes, mime_type, max_output_tokens=8192
        )
        if truncated and result.diagrams:
            logger.warning("PDF vision response truncated — diagram list may be incomplete")

    if use_cache:
        _cache[key] = result
        logger.debug("Vision cached: %s (%d chars, %d diagrams)", key[:16], len(result.text), len(result.diagrams))

    return result


async def _read_office_batched(
    images: list[ImagePart],
    body_text: str | None,
) -> ReadResult:
    """Batch + merge toàn bộ ảnh của office file (Fix B + F)."""
    batches = [
        images[i:i + VISION_BATCH_SIZE]
        for i in range(0, len(images), VISION_BATCH_SIZE)
    ]
    sem = asyncio.Semaphore(_VISION_CONCURRENCY)

    async def _run(batch: list[ImagePart], depth: int) -> list[DiagramInfo]:
        async with sem:
            result, truncated = await _call_gemini_vision_once(
                b"", "", images=batch, body_text=body_text,
                max_output_tokens=VISION_BATCH_MAX_TOKENS,
            )
        if truncated and len(batch) > 1 and depth < VISION_MAX_SPLIT_DEPTH:
            # Fix F: response bị cắt → chia đôi batch, chạy lại từng nửa.
            mid = len(batch) // 2
            logger.info(
                "Vision batch truncated (%d imgs, depth %d) — splitting %d+%d",
                len(batch), depth, mid, len(batch) - mid,
            )
            left = await _run(batch[:mid], depth + 1)
            right = await _run(batch[mid:], depth + 1)
            return left + right
        if truncated:
            logger.warning(
                "Vision batch still truncated after depth %d — %d/%d images described",
                depth, len(result.diagram_infos), len(batch),
            )
        return result.diagram_infos

    results = await asyncio.gather(*(_run(b, 0) for b in batches))
    infos: list[DiagramInfo] = [i for batch_infos in results for i in batch_infos]
    # Bù nhìn: model không echo số figure → suy lại từ label caption (Fix A đảm
    # bảo label luôn có "Figure N:" khi inventory bắt được caption).
    for info in infos:
        if info.figure is None and info.caption:
            m = re.match(r"(?:Figure|Fig\.?|Hình)\s*(\d+)", info.caption, re.IGNORECASE)
            if m:
                info.figure = int(m.group(1))
    # Merge theo figure number (nếu có), giữ thứ tự tài liệu gốc qua label/order.
    infos = _merge_by_figure(infos)
    return ReadResult(text="", diagrams=[i.description for i in infos], diagram_infos=infos)


def _merge_by_figure(infos: list[DiagramInfo]) -> list[DiagramInfo]:
    """Loại bản trùng theo figure number (retry/split có thể sinh duplicate).

    Không sắp xếp lại thứ tự khi thiếu số — giữ nguyên thứ tự gửi để không phá
    tương thích consumer cũ (chunk_indexer chỉ đọc list).
    """
    seen: set[int] = set()
    merged: list[DiagramInfo] = []
    for info in infos:
        if info.figure is not None:
            if info.figure in seen:
                continue
            seen.add(info.figure)
        merged.append(info)
    return merged


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