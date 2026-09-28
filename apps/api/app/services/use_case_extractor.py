"""UseCaseExtractor — trích Use Case từ tài liệu SRS (Report 3) bằng AI.

Luồng:
  1. Lấy text SRS qua `parse_and_chunk` (đã có vision reader fallback)
  2. Ghép ~10 chunk đầu vào prompt (giữ trong giới hạn ~12k char)
  3. Gọi AI gateway yêu cầu JSON: [{uc_code, name, actor, transactions_est}]
  4. Validate + chuẩn hoá (case-insensitive uc_code) → trả về cho router

Trả về DICT dạng:
  {
    "uc_count": int,
    "use_cases": [{"uc_code": "UC01", "name": "Đăng nhập",
                   "actor": "Sinh viên", "transactions_est": 4}],
    "model": str,
    "provider": str,
    "extracted_chars": int,
  }
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

from app.services.ai_client import ai_gateway
from app.services.document_parser import parse_and_chunk
from app.services.feature_ai import resolve_feature_ai

logger = logging.getLogger(__name__)

# Số chunk tối đa gửi lên LLM (giữ prompt < ~12k char)
_MAX_CHUNKS = 10
# Độ dài tối đa mỗi chunk (cắt để khỏi tràn token)
_CHUNK_CHAR_CAP = 1200
# Số ký tự text tối đa từ 1 SRS (cap cứng chống OOM)
_TOTAL_TEXT_CAP = 50_000

# Regex strict JSON object (LLaMA/Gemini hay bám thêm ```json fences)
_JSON_FENCE = re.compile(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", re.DOTALL)


def _strip_fences(text: str) -> str:
    m = _JSON_FENCE.search(text)
    if m:
        return m.group(1)
    # Nếu không có fence mà là JSON thuần thì cứ trả về
    return text.strip()


def _coerce_use_case(raw: dict, idx: int) -> Optional[dict]:
    """Validate 1 dict UC thô → dict sạch hoặc None nếu quá rỗng."""
    if not isinstance(raw, dict):
        return None
    code = str(raw.get("uc_code") or raw.get("code") or f"UC{idx:02d}").strip()
    if not code:
        return None
    # Chuẩn hoá mã UC: upper + bỏ khoảng trắng giữa, nếu có dạng UC01 → UC01
    code = re.sub(r"\s+", "", code).upper()[:40]
    if not re.match(r"^[A-Z0-9_\-]+$", code):
        return None
    name = str(raw.get("name") or raw.get("ten") or "").strip()[:255]
    if not name:
        return None
    actor = str(raw.get("actor") or raw.get("tac_nhan") or "").strip()[:100] or None
    tx_raw = raw.get("transactions_est")
    if tx_raw in (None, ""):
        tx_raw = raw.get("so_giao_dich")
    try:
        tx = int(tx_raw) if tx_raw not in (None, "", "null") else None
    except (TypeError, ValueError):
        tx = None
    if tx is not None:
        tx = max(1, min(tx, 50))
    return {
        "uc_code": code,
        "name": name,
        "actor": actor,
        "transactions_est": tx,
    }


def _parse_use_case_response(content: str) -> list[dict]:
    """Parse JSON từ output LLM, chịu lỗi format (try/except khoan dung)."""
    text = _strip_fences(content or "")
    # Cố gắng parse thẳng
    try:
        data = json.loads(text)
    except Exception:
        # Có khi model trả [{...}, {...}] ở root, thử cắt ngoặc
        m = re.search(r"(\[.*\]|\{.*\})", text, re.DOTALL)
        if not m:
            logger.warning("UC extractor: no JSON found in LLM output (len=%d)", len(text))
            return []
        try:
            data = json.loads(m.group(1))
        except Exception:
            logger.warning("UC extractor: cannot parse JSON from LLM")
            return []
    # Chuẩn hoá: chấp nhận list, hoặc dict {"use_cases": [...]}
    if isinstance(data, dict):
        items = data.get("use_cases") or data.get("items") or []
    else:
        items = data
    if not isinstance(items, list):
        return []
    out: list[dict] = []
    seen_codes: set[str] = set()
    for i, raw in enumerate(items, start=1):
        cleaned = _coerce_use_case(raw, i)
        if not cleaned:
            continue
        # Chống trùng mã trong 1 response (model đôi khi lặp)
        if cleaned["uc_code"] in seen_codes:
            continue
        seen_codes.add(cleaned["uc_code"])
        out.append(cleaned)
    return out


_SYSTEM_PROMPT = (
    "Bạn là trợ lý tách Use Case từ tài liệu SRS (đặc tả yêu cầu phần mềm). "
    "QUAN TRỌNG:\n"
    "  - Chỉ trả JSON hợp lệ, không giải thích thêm, không bọc ```json.\n"
    '  - Schema: {"use_cases": [{"uc_code": "UC01", "name": "Tên UC", '
    '"actor": "Tác nhân chính", "transactions_est": 3}]}\n'
    "  - uc_code: mã UC gốc trong tài liệu (giữ nguyên UC01/UC-Login/...). "
    "Nếu không có mã, tự tạo UC01, UC02, ... theo thứ tự xuất hiện.\n"
    "  - name: tên UC bằng tiếng Việt, ngắn gọn (≤60 ký tự).\n"
    "  - actor: tác nhân chính (Sinh viên / Giảng viên / Admin / Hệ thống / ...). "
    'Để null "" nếu không rõ.\n'
    "  - transactions_est: ước lượng số giao dịch nghiệp vụ chính trong UC "
    "(Student Guide SEP490: 3–7, điển hình 4). Để null nếu không đoán được.\n"
    "  - Bỏ qua Use Case con, Use Case include/extend nếu SRS đã ghi rõ (chỉ lấy top-level).\n"
    "  - Tối đa 50 UC, nếu SRS có nhiều hơn hãy gộp các UC trùng chức năng."
)


async def extract_use_cases_from_document(
    db, document_id: int, *, max_chunks: int = _MAX_CHUNKS
) -> dict[str, Any]:
    """
    Trích UC từ Document trong DB (SRS file đã upload).

    Args:
        db: AsyncSession.
        document_id: ID Document trỏ tới file SRS.
        max_chunks: số chunk tối đa gửi LLM (mặc định 10).

    Returns:
        Dict {uc_count, use_cases, model, provider, extracted_chars, prompt_chars}.

    Raises:
        ValueError: nếu document không tồn tại.
        RuntimeError: nếu AI provider không available.
    """
    from sqlalchemy import select
    from app.models.document import Document

    doc = (await db.execute(select(Document).where(Document.id == document_id))).scalar_one_or_none()
    if not doc:
        raise ValueError(f"Document {document_id} không tồn tại")

    # Parse + chunk
    chunks, _ = await parse_and_chunk(doc)
    if not chunks:
        return {
            "uc_count": 0,
            "use_cases": [],
            "model": None,
            "provider": None,
            "extracted_chars": 0,
            "prompt_chars": 0,
            "warning": "Không trích được text từ tài liệu (file rỗng hoặc chỉ chứa ảnh).",
        }
    # Cap chunk size + tổng text
    truncated: list[str] = []
    total = 0
    for c in chunks[:max_chunks]:
        seg = c[:_CHUNK_CHAR_CAP]
        truncated.append(seg)
        total += len(seg)
        if total >= _TOTAL_TEXT_CAP:
            break
    body = "\n\n---\n\n".join(truncated)

    provider, model = await resolve_feature_ai(db, "use_case_extract")
    prompt = (
        f"Trích Use Case từ phần SRS sau (tài liệu: {doc.filename or doc.id}).\n"
        f"--- BEGIN SRS ---\n{body}\n--- END SRS ---\n\n"
        "Trả về JSON đúng schema ở system prompt."
    )

    try:
        result = await ai_gateway.generate(
            prompt=prompt,
            provider=provider,
            model=model,
            system_prompt=_SYSTEM_PROMPT,
            temperature=0.0,
            max_tokens=4000,
        )
        use_cases = _parse_use_case_response(result.get("content", ""))
        return {
            "uc_count": len(use_cases),
            "use_cases": use_cases,
            "model": result.get("model"),
            "provider": result.get("provider"),
            "extracted_chars": total,
            "prompt_chars": len(prompt),
        }
    except Exception as exc:
        logger.exception("UC extract failed for document %s: %s", document_id, exc)
        raise RuntimeError(f"AI extraction thất bại: {exc}") from exc
