"""scoring_service — tính điểm từ rubric DB-driven (BR-A1).

Quy tắc (REQUIREMENT §3.1 / issue BR-A1):
- Final = OGA × 50% + TDA × 50%, làm tròn 1 chữ số thập phân, thang 0–10.
- Điểm nhóm rubric = Σ(mark × weight) / Σ(weight) — mark thiếu coi như chưa chấm
  (chỉ tính trên các item đã có điểm, trả kèm coverage để UI cảnh báo).
- Mọi con số (weight, pass mark, scale) ĐỌC TỪ rubric config, không hard-code.
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Iterable

_Q = Decimal("0.1")  # 1 chữ số thập phân


def _round1(value: Decimal) -> Decimal:
    return value.quantize(_Q, rounding=ROUND_HALF_UP)


def group_score(
    items: dict[str, float],
    weights: dict[str, float],
) -> dict[str, Any]:
    """Điểm weighted-average của 1 nhóm (OGA hoặc TDA).

    items:   {item_code: mark} — chỉ các item đã chấm
    weights: {item_code: weight} — từ rubric config
    Trả về: {score, scored_items, total_items, missing_items}
    """
    known = {k: w for k, w in weights.items() if k in items}
    total_weight = sum((Decimal(str(w)) for w in known.values()), Decimal(0))
    if total_weight == 0:
        score = None
    else:
        acc = sum((Decimal(str(items[k])) * Decimal(str(w)) for k, w in known.items()), Decimal(0))
        score = _round1(acc / total_weight)
    return {
        "score": float(score) if score is not None else None,
        "scored_items": len(known),
        "total_items": len(weights),
        "missing_items": sorted(set(weights) - set(known)),
    }


def final_score(
    oga_items: dict[str, float],
    tda_items: dict[str, float],
    rubric_config: dict[str, Any],
) -> dict[str, Any]:
    """Tính OGA/TDA/Final + verdict pass theo rubric config (DB-driven).

    rubric_config: config JSONB của rubric key='defense_sep490'
    (cấu trúc grading.{oga,tda}.weight + grading.{oga,tda}.items + subject).
    """
    grading = rubric_config.get("grading", {})
    subject = rubric_config.get("subject", {})
    pass_mark = Decimal(str(subject.get("min_avg_to_pass", 5)))
    scale_max = Decimal(str(subject.get("scale", 10)))

    oga_def, tda_def = grading.get("oga", {}), grading.get("tda", {})
    oga = group_score(oga_items, oga_def.get("items", {}))
    tda = group_score(tda_items, tda_def.get("items", {}))

    w_oga = Decimal(str(oga_def.get("weight", 50))) / 100
    w_tda = Decimal(str(tda_def.get("weight", 50))) / 100

    final = None
    verdict = "incomplete"
    # Rule BR-B1 R-FAIL-1 (syllabus §5.1): OGA < min_oga_to_pass → cấm bảo vệ,
    # override mọi kết quả khác bất kể TDA.
    min_oga = Decimal(str(subject.get("min_oga_to_pass", subject.get("min_avg_to_pass", 5))))
    if oga["score"] is not None and Decimal(str(oga["score"])) < min_oga:
        verdict = "banned_oga_below_min"
    elif oga["score"] is not None and tda["score"] is not None:
        final = _round1(Decimal(str(oga["score"])) * w_oga + Decimal(str(tda["score"])) * w_tda)
        # Rule BR-B1 đầy đủ sẽ override sau (hoãn/cấm); ở đây chỉ pass-mark check tối thiểu.
        verdict = "pass" if final >= pass_mark else "fail"

    return {
        "oga": oga,
        "tda": tda,
        "final": float(final) if final is not None else None,
        "verdict": verdict,
        "pass_mark": float(pass_mark),
        "scale_max": float(scale_max),
        "weights": {"oga": float(w_oga), "tda": float(w_tda)},
    }


def aggregate_student(
    rows: Iterable[tuple[str, str, float]],
    rubric_config: dict[str, Any],
) -> dict[str, Any]:
    """Tổng hợp các dòng điểm (group, item_code, mark) của 1 sinh viên.

    Nhiều giám khảo trên cùng item → trung bình cộng mark trước,
    rồi weighted-average theo weight rubric (điểm cá nhân = trung bình
    các mark — Student Guide W1).
    """
    buckets: dict[str, dict[str, list[float]]] = {"OGA": {}, "TDA": {}}
    for group, item_code, mark in rows:
        buckets.setdefault(group, {}).setdefault(item_code, []).append(float(mark))
    means = {
        group: {code: sum(v) / len(v) for code, v in items.items()}
        for group, items in buckets.items()
    }
    return final_score(means.get("OGA", {}), means.get("TDA", {}), rubric_config)
