"""Dựng dữ liệu báo cáo sinh viên sau Mock Defense — hàm thuần, không I/O.

BR-A1: tiêu chí, mức đánh giá, nhãn & trọng số hạng mục đọc từ rubric config
(key='defense_sep490'), không hard-code. AI KHÔNG chấm điểm số: phần AI chỉ là
nhận xét định tính theo `quality_criteria`; điểm OGA/TDA lấy từ DefenseScore.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Iterable, Optional

from app.services.scoring_service import final_score

# Job AI kẹt quá lâu (worker chết / restart) → coi như lỗi để SV bấm tạo lại.
GENERATION_STALE_AFTER = timedelta(minutes=15)

MAX_LIST_ITEMS = 8
MAX_ITEM_CHARS = 400
TRANSCRIPT_MESSAGE_CHARS = 2500
TRANSCRIPT_PROMPT_CHARS = 24000
TITLE_CHARS = 80

# Model AI đôi khi chèn chữ Hán vào câu tiếng Việt ("khi被 hỏi") — tiếng Việt
# không dùng chữ Hán nên lọc bỏ khỏi output.
_CJK_RE = re.compile(r"[㐀-䶿一-鿿豈-﫿]+")

# Rule BR-B1 → loại kết luận; _OUTCOME_ORDER = mức nghiêm trọng giảm dần.
_RULE_OUTCOME = {
    "R-FAIL-1": "banned",
    "R-REDO": "redo",
    "R-DELAY-1": "deferred",
    "R-DELAY-2": "deferred",
    "R-DELAY-3": "deferred",
    "R-INDIV": "fail_individual",
}
_OUTCOME_ORDER = ("banned", "redo", "deferred", "fail_individual")
VERDICT_LABELS = {
    "banned": "Cảnh báo: không đủ điều kiện bảo vệ",
    "redo": "Cảnh báo: có nguy cơ phải làm lại đồ án",
    "deferred": "Cảnh báo: có nguy cơ hoãn sang vòng 2",
    "fail_individual": "Cảnh báo: có nguy cơ rớt cá nhân",
    "pass": "Dự báo: đạt",
    "fail": "Dự báo: chưa đạt",
    "insufficient_data": "Chưa đủ dữ liệu để kết luận",
}


def round1(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def _num(value: Any) -> str:
    if value is None:
        return "?"
    f = float(value)
    return str(int(f)) if f.is_integer() else str(f)


# ── Hội thoại ───────────────────────────────────────────────────────────────

def build_transcript(messages: Iterable[Any]) -> list[dict[str, str]]:
    """MockChatMessage rows → snapshot [{role: student|examiner, content, time}]."""
    transcript = []
    for m in messages:
        content = (m.content or "").strip()
        if not content:
            continue
        transcript.append({
            "role": "student" if m.role == "user" else "examiner",
            "content": content,
            "time": m.time_label or "",
        })
    return transcript


def has_student_answer(transcript: list[dict[str, Any]]) -> bool:
    return any(t.get("role") == "student" for t in transcript)


def format_transcript_for_prompt(
    transcript: list[dict[str, Any]], max_chars: int = TRANSCRIPT_PROMPT_CHARS
) -> str:
    """Biên bản cho prompt. Quá dài → giữ phần mở đầu (SV trình bày tổng quan)
    và các lượt gần nhất, lược phần giữa."""
    lines = [
        f"[{'Sinh viên' if t.get('role') == 'student' else 'Giám khảo AI'}]: "
        f"{str(t.get('content', ''))[:TRANSCRIPT_MESSAGE_CHARS]}"
        for t in transcript
    ]
    if sum(len(line) + 2 for line in lines) <= max_chars:
        return "\n\n".join(lines)

    head = lines[:3]
    budget = max_chars - sum(len(line) + 2 for line in head) - 80
    tail: list[str] = []
    for line in reversed(lines[3:]):
        if len(line) + 2 > budget:
            break
        tail.append(line)
        budget -= len(line) + 2
    tail.reverse()
    omitted = len(lines) - len(head) - len(tail)
    return "\n\n".join(head + [f"[... lược bớt {omitted} lượt trao đổi ở giữa ...]"] + tail)


# ── Output AI ───────────────────────────────────────────────────────────────

def extract_json_object(content: str) -> dict[str, Any]:
    """Lấy object JSON từ output AI (bỏ ```json fence / đoạn reasoning thừa)."""
    text = (content or "").strip()
    fence = "`" * 3
    if text.startswith(fence):
        text = re.sub(r"^" + fence + r"(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*" + fence + r"$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            return {}
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return {}
    return data if isinstance(data, dict) else {}


def _text(value: Any, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"[ \t]{2,}", " ", _CJK_RE.sub(" ", value)).strip()[:limit]


def _text_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [s for s in (_text(v, MAX_ITEM_CHARS) for v in value) if s][:MAX_LIST_ITEMS]


def _match_level(raw: Any, levels: list[str]) -> Optional[str]:
    if not isinstance(raw, str):
        return None
    wanted = raw.strip().lower()
    return next((lv for lv in levels if lv.lower() == wanted), None)


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("true", "1", "yes", "có")


def normalize_ai_review(payload: dict[str, Any], rubric_cfg: dict[str, Any]) -> dict[str, Any]:
    """Ép output AI về đúng khung rubric.

    - Chỉ giữ tiêu chí/CLO có trong rubric, theo thứ tự rubric.
    - Mức ngoài `levels` của rubric (hoặc AI bỏ sót tiêu chí) → None = chưa đủ căn cứ.
    Raise ValueError nếu AI không trả được nhận xét nào dùng được.
    """
    raw_criteria = payload.get("quality_criteria")
    by_key: dict[str, dict[str, Any]] = {}
    if isinstance(raw_criteria, list):
        for item in raw_criteria:
            if isinstance(item, dict) and isinstance(item.get("key"), str):
                by_key.setdefault(item["key"].strip(), item)
    elif isinstance(raw_criteria, dict):
        for key, item in raw_criteria.items():
            by_key.setdefault(str(key).strip(), item if isinstance(item, dict) else {"level": item})

    criteria = []
    for c in rubric_cfg.get("quality_criteria") or []:
        key = c.get("key")
        if not key:
            continue
        item = by_key.get(key, {})
        criteria.append({
            "key": key,
            "level": _match_level(item.get("level"), c.get("levels") or []),
            "comment": _text(item.get("comment"), 1000),
            "evidence": _text(item.get("evidence"), 600),
        })

    clo_order = [c.get("code") for c in rubric_cfg.get("clo") or [] if c.get("code")]
    clo_items: dict[str, dict[str, Any]] = {}
    raw_clo = payload.get("clo_coverage")
    if isinstance(raw_clo, list):
        for item in raw_clo:
            if not isinstance(item, dict):
                continue
            code = item.get("clo")
            if code in clo_order and code not in clo_items:
                clo_items[code] = {
                    "clo": code,
                    "covered": _as_bool(item.get("covered")),
                    "comment": _text(item.get("comment"), MAX_ITEM_CHARS),
                }

    review = {
        "overall_comment": _text(payload.get("overall_comment"), 2000),
        "quality_criteria": criteria,
        "strengths": _text_list(payload.get("strengths")),
        "weaknesses": _text_list(payload.get("weaknesses")),
        "action_items": _text_list(payload.get("action_items")),
        "clo_coverage": [clo_items[c] for c in clo_order if c in clo_items],
    }
    if not (
        any(c["level"] for c in criteria)
        or review["overall_comment"]
        or review["strengths"]
        or review["weaknesses"]
    ):
        raise ValueError("AI trả về dữ liệu không hợp lệ (không có nhận xét theo tiêu chí)")
    return review


# ── Rubric & điểm ───────────────────────────────────────────────────────────

def item_labels(rubric_cfg: dict[str, Any]) -> dict[str, str]:
    return {str(k): str(v) for k, v in (rubric_cfg.get("item_labels") or {}).items()}


def group_items(rubric_cfg: dict[str, Any], key: str) -> list[tuple[str, Any]]:
    """(mã hạng mục, trọng số) của nhóm `oga`/`tda` theo thứ tự `item_order`.

    Cột rubrics.config là JSONB nên Postgres tự sắp lại key của object — dict
    `grading.*.items` đọc từ DB không còn theo thứ tự syllabus. Hạng mục không có
    trong `item_order` xếp cuối, giữ thứ tự gốc.
    """
    weights = ((rubric_cfg.get("grading") or {}).get(key) or {}).get("items") or {}
    order = {code: i for i, code in enumerate(rubric_cfg.get("item_order") or [])}
    return sorted(weights.items(), key=lambda kv: order.get(kv[0], len(order)))


def rubric_view(rubric: Any) -> Optional[dict[str, Any]]:
    """Khung rubric cho FE: nhóm OGA/TDA (nhãn + trọng số), tiêu chí chất lượng, CLO."""
    if rubric is None:
        return None
    cfg = dict(rubric.config or {})
    grading = cfg.get("grading", {})
    subject = cfg.get("subject", {})
    labels = item_labels(cfg)
    groups = []
    for group, key in (("OGA", "oga"), ("TDA", "tda")):
        groups.append({
            "group": group,
            "weight_pct": (grading.get(key) or {}).get("weight"),
            "items": [
                {"code": code, "label": labels.get(code, code), "weight": weight}
                for code, weight in group_items(cfg, key)
            ],
        })
    return {
        "key": rubric.key,
        "name": rubric.name,
        "version": rubric.version,
        "scale_max": subject.get("scale", 10),
        "pass_mark": subject.get("min_avg_to_pass", 5),
        "groups": groups,
        "quality_criteria": [
            {
                "key": c["key"],
                "label": c.get("label") or c["key"],
                "levels": c.get("levels") or [],
                "description": c.get("description"),
            }
            for c in cfg.get("quality_criteria") or [] if c.get("key")
        ],
        "clo": [
            {"code": c["code"], "desc": c.get("desc", "")}
            for c in cfg.get("clo") or [] if c.get("code")
        ],
    }


def summarize_scores(rows: Iterable[Any], rubric_cfg: dict[str, Any]) -> dict[str, Any]:
    """Gom DefenseScore theo hạng mục rubric, tách điểm mentor/admin (official) và AI.

    Nhiều giám khảo cùng hạng mục → trung bình cộng trước, rồi weighted theo
    rubric (scoring_service.final_score).
    """
    labels = item_labels(rubric_cfg)
    marks: dict[str, dict[str, dict[str, list[float]]]] = {
        "official": {"OGA": {}, "TDA": {}},
        "ai": {"OGA": {}, "TDA": {}},
    }
    reviews: dict[tuple[str, str], list[dict[str, Any]]] = {}
    reviewers: set[Any] = set()
    for r in rows:
        if r.group not in ("OGA", "TDA"):
            continue
        source = "ai" if r.is_ai else "official"
        mark = float(r.mark)
        marks[source][r.group].setdefault(r.item_code, []).append(mark)
        reviews.setdefault((r.group, r.item_code), []).append({
            "reviewer_name": r.reviewer_name,
            "mark": mark,
            "comment": r.comment,
            "is_ai": bool(r.is_ai),
        })
        if not r.is_ai:
            reviewers.add(r.reviewer_id or r.reviewer_name)

    def _means(source: str, group: str) -> dict[str, float]:
        return {code: sum(v) / len(v) for code, v in marks[source][group].items()}

    def _result(source: str) -> Optional[dict[str, Any]]:
        if not marks[source]["OGA"] and not marks[source]["TDA"]:
            return None
        return final_score(_means(source, "OGA"), _means(source, "TDA"), rubric_cfg)

    items: dict[str, list[dict[str, Any]]] = {}
    for group, key in (("OGA", "oga"), ("TDA", "tda")):
        official, ai = _means("official", group), _means("ai", group)
        items[group] = [
            {
                "code": code,
                "label": labels.get(code, code),
                "weight": weight,
                "mark": round1(official[code]) if code in official else None,
                "ai_mark": round1(ai[code]) if code in ai else None,
                "reviews": reviews.get((group, code), []),
            }
            for code, weight in group_items(rubric_cfg, key)
        ]
    return {
        "official": _result("official"),
        "ai": _result("ai"),
        "items": items,
        "reviewer_count": len(reviewers),
    }


def hide_rubric_details(scores: dict[str, Any]) -> dict[str, Any]:
    """Bản cho gói chưa có "đánh giá theo rubric chi tiết": còn điểm tổng, ẩn điểm từng hạng mục."""
    official = scores["official"]
    return {
        **scores,
        "official": {**official, "oga": None, "tda": None} if official else None,
        "ai": None,
        "items": {
            group: [{**item, "mark": None, "ai_mark": None, "reviews": []} for item in items]
            for group, items in scores["items"].items()
        },
    }


# ── Trạng thái & kết luận ───────────────────────────────────────────────────

def effective_generation_status(report: Any, now: Optional[datetime] = None) -> str:
    """generation_status, nhưng pending quá lâu (worker chết) → failed."""
    status = report.generation_status or "ready"
    if status == "pending":
        ref = report.updated_at or report.created_at
        if ref is not None and (now or datetime.utcnow()) - ref > GENERATION_STALE_AFTER:
            return "failed"
    return status


def display_status(generation_status: str, has_official_scores: bool) -> str:
    """pending: AI đang tổng hợp / lỗi · in_review: đã có nhận xét AI, chưa có
    điểm mentor · completed: mentor/hội đồng đã chấm."""
    if has_official_scores:
        return "completed"
    if generation_status in ("pending", "failed"):
        return "pending"
    return "in_review"


def rule_is_violated(rule: dict[str, Any]) -> bool:
    """Agent báo vi phạm và hội đồng không bác (reject), HOẶC rule hội đồng-tick đã confirm."""
    decision = rule.get("human_decision")
    if rule.get("auto_status") == "violated":
        return decision != "reject"
    return bool(rule.get("needs_human")) and decision == "confirm"


def _rule_reason(rule: dict[str, Any]) -> str:
    name = rule.get("rule_name") or rule.get("rule_id") or ""
    summary = rule.get("input_summary")
    return f"{name} ({summary})" if summary and summary != "—" else name


def _verdict(code: str, reasons: list[str]) -> dict[str, Any]:
    return {"code": code, "label": VERDICT_LABELS[code], "reasons": reasons, "is_official": False}


def compute_verdict(
    rules: list[dict[str, Any]], official: Optional[dict[str, Any]]
) -> dict[str, Any]:
    """Banner kết luận theo quy tắc qua/rớt (§3.6).

    Luôn là DỰ BÁO: buổi mock không phải kết quả chính thức của hội đồng.
    """
    hits: dict[str, list[str]] = {}
    for rule in rules:
        outcome = _RULE_OUTCOME.get(rule.get("rule_id"))
        if outcome and rule_is_violated(rule):
            hits.setdefault(outcome, []).append(_rule_reason(rule))
    for outcome in _OUTCOME_ORDER:
        if outcome in hits:
            return _verdict(outcome, hits[outcome])

    if official is None:
        return _verdict("insufficient_data", [
            "Chưa có điểm từ mentor/hội đồng. Buổi Mock AI chỉ có nhận xét định tính, không chấm điểm số."
        ])
    if official.get("verdict") == "banned_oga_below_min":
        return _verdict("banned", [f"OGA {_num(official['oga']['score'])} dưới ngưỡng tối thiểu"])
    final = official.get("final")
    if final is not None:
        scale, pass_mark = _num(official.get("scale_max")), _num(official.get("pass_mark"))
        if official.get("verdict") == "pass":
            return _verdict("pass", [f"Điểm tổng {_num(final)}/{scale} ≥ {pass_mark}"])
        return _verdict("fail", [f"Điểm tổng {_num(final)}/{scale} < {pass_mark}"])
    oga, tda = official.get("oga") or {}, official.get("tda") or {}
    return _verdict("insufficient_data", [
        f"Mới chấm {oga.get('scored_items', 0)}/{oga.get('total_items', 0)} hạng mục OGA "
        f"và {tda.get('scored_items', 0)}/{tda.get('total_items', 0)} hạng mục TDA."
    ])


def short_title(text: str, limit: int = TITLE_CHARS) -> str:
    """Tiêu đề 1 dòng. Tiêu đề phiên Mock AI là câu trả lời đầu của SV (đã bị cắt
    cứng 100 ký tự) → cắt ở ranh giới từ + '…' thay vì đứt giữa chữ."""
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(" ,.;:-–—") or text[:limit]
    return f"{cut}…"


def review_view(report: Any, rubric_cfg: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Nhận xét AI đã lưu + nhãn từ rubric hiện tại (None nếu chưa có nhận xét)."""
    if report.quality_criteria is None and not report.ai_feedback:
        return None
    criteria_cfg = {c.get("key"): c for c in rubric_cfg.get("quality_criteria") or [] if c.get("key")}
    clo_cfg = {c.get("code"): c for c in rubric_cfg.get("clo") or [] if c.get("code")}
    stored_clo = {c.get("clo"): c for c in report.clo_breakdown or [] if isinstance(c, dict)}
    return {
        "overall_comment": report.ai_feedback or "",
        "quality_criteria": [
            {**item, "label": (criteria_cfg.get(item.get("key")) or {}).get("label") or item.get("key")}
            for item in report.quality_criteria or [] if isinstance(item, dict)
        ],
        "strengths": report.strengths or [],
        "weaknesses": report.weaknesses or [],
        "action_items": report.action_items or [],
        # AI hay bỏ qua CLO không được hỏi tới → vẫn liệt kê là "chưa đề cập" (theo
        # rubric hiện tại) để SV biết phần cần tự ôn; AI không trả phần CLO → để trống.
        "clo_coverage": [
            {**(stored_clo.get(code) or {"clo": code, "covered": False, "comment": ""}), "desc": c.get("desc", "")}
            for code, c in clo_cfg.items()
        ] if stored_clo else [],
    }
