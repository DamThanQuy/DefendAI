"""Unit test report_builder + prompt báo cáo — hàm thuần, không cần DB/Redis/AI.

Chạy:
    docker exec defense-api pytest tests/test_report_builder.py -v
"""
import copy
import os
import sys
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from seed_rubrics import RUBRICS  # noqa: E402
from app.prompts.mock_report import build_report_prompts  # noqa: E402
from app.services.report_builder import (  # noqa: E402
    build_transcript,
    compute_verdict,
    display_status,
    effective_generation_status,
    extract_json_object,
    format_transcript_for_prompt,
    group_items,
    has_student_answer,
    normalize_ai_review,
    review_view,
    rubric_view,
    short_title,
    summarize_scores,
)

CFG = next(r for r in RUBRICS if r["key"] == "defense_sep490")["config"]
RUBRIC = SimpleNamespace(key="defense_sep490", name="SEP490", version="1.0", config=CFG)


def _score(group, code, mark, *, is_ai=False, reviewer_id=1, name="Mentor A"):
    return SimpleNamespace(
        group=group,
        item_code=code,
        mark=mark,
        is_ai=is_ai,
        reviewer_id=None if is_ai else reviewer_id,
        reviewer_name=name,
        comment=None,
    )


def _all_items(group_key, mark):
    group = group_key.upper()
    return [_score(group, code, mark) for code in CFG["grading"][group_key]["items"]]


def _rule(rule_id, auto_status, *, needs_human=False, decision=None, summary="—"):
    return {
        "rule_id": rule_id,
        "rule_name": rule_id,
        "auto_status": auto_status,
        "input_summary": summary,
        "needs_human": needs_human,
        "human_decision": decision,
    }


class TestNormalizeAiReview:
    def test_maps_levels_and_fills_missing_criteria(self):
        payload = {
            "overall_comment": "Trình bày ổn",
            "quality_criteria": [
                {"key": "tinh_thuc_te", "level": "đạt", "comment": "Demo chạy", "evidence": "đã deploy"},
                {"key": "br_chac", "level": "Xuất sắc"},  # mức ngoài rubric
                {"key": "khong_co_trong_rubric", "level": "Đạt"},
            ],
            "strengths": ["Nắm kiến trúc", "", 3],
            "clo_coverage": [
                {"clo": "CLO2", "covered": True},
                {"clo": "CLO1", "covered": "false"},
                {"clo": "CLO9", "covered": True},
            ],
        }
        review = normalize_ai_review(payload, CFG)
        levels = {c["key"]: c["level"] for c in review["quality_criteria"]}
        assert list(levels) == [c["key"] for c in CFG["quality_criteria"]]
        assert levels["tinh_thuc_te"] == "Đạt"
        assert levels["br_chac"] is None
        assert levels["giai_quyet_van_de_hien_tai"] is None
        assert review["strengths"] == ["Nắm kiến trúc"]
        assert [c["clo"] for c in review["clo_coverage"]] == ["CLO1", "CLO2"]
        assert review["clo_coverage"][0]["covered"] is False

    def test_accepts_dict_shaped_criteria(self):
        review = normalize_ai_review({"quality_criteria": {"br_chac": "Khá"}}, CFG)
        assert next(c for c in review["quality_criteria"] if c["key"] == "br_chac")["level"] == "Khá"

    def test_rejects_payload_without_usable_review(self):
        with pytest.raises(ValueError):
            normalize_ai_review({"quality_criteria": [{"key": "br_chac", "level": "??"}]}, CFG)

    def test_strips_cjk_leaked_into_vietnamese(self):
        review = normalize_ai_review(
            {
                "overall_comment": "Không né tránh khi被 hỏi\nvề thiết kế",
                "strengths": ["Trả lời的 rõ"],
                "clo_coverage": [{"clo": "CLO7", "covered": True, "comment": "thái độ 很好 tốt"}],
            },
            CFG,
        )
        assert review["overall_comment"] == "Không né tránh khi hỏi\nvề thiết kế"
        assert review["strengths"] == ["Trả lời rõ"]
        assert review["clo_coverage"][0]["comment"] == "thái độ tốt"


class TestExtractJson:
    def test_fenced(self):
        assert extract_json_object('```json\n{"a": 1}\n```') == {"a": 1}

    def test_reasoning_preamble(self):
        assert extract_json_object('Suy nghĩ trước...\n{"a": {"b": 2}}\nxong') == {"a": {"b": 2}}

    def test_not_an_object(self):
        assert extract_json_object("không có json") == {}
        assert extract_json_object("[1, 2]") == {}


class TestTranscript:
    def test_build_transcript_roles(self):
        rows = [
            SimpleNamespace(role="mentor", content="Hỏi?", time_label="10:00"),
            SimpleNamespace(role="user", content="  Trả lời ", time_label=None),
            SimpleNamespace(role="user", content="   ", time_label=""),
        ]
        transcript = build_transcript(rows)
        assert transcript == [
            {"role": "examiner", "content": "Hỏi?", "time": "10:00"},
            {"role": "student", "content": "Trả lời", "time": ""},
        ]
        assert has_student_answer(transcript)
        assert not has_student_answer(transcript[:1])

    def test_prompt_truncation_keeps_opening_and_latest(self):
        transcript = [
            {"role": "student" if i % 2 else "examiner", "content": f"msg{i} " + "x" * 500}
            for i in range(100)
        ]
        text = format_transcript_for_prompt(transcript, max_chars=5000)
        assert len(text) <= 5000
        assert "msg0 " in text and "msg99 " in text
        assert "lược bớt" in text


class TestScores:
    def test_averages_reviewers_and_separates_ai(self):
        rows = [
            _score("TDA", "srs", 8, reviewer_id=1),
            _score("TDA", "srs", 6, reviewer_id=2, name="Mentor B"),
            _score("TDA", "qa", 9, is_ai=True, name="Giám khảo AI"),
        ]
        scores = summarize_scores(rows, CFG)
        srs = next(i for i in scores["items"]["TDA"] if i["code"] == "srs")
        qa = next(i for i in scores["items"]["TDA"] if i["code"] == "qa")
        assert srs["mark"] == 7.0
        assert srs["label"] == CFG["item_labels"]["srs"]
        assert qa["mark"] is None and qa["ai_mark"] == 9.0
        assert scores["reviewer_count"] == 2
        assert scores["official"]["tda"]["score"] == 7.0
        assert scores["official"]["final"] is None  # chưa có OGA
        assert scores["ai"]["tda"]["score"] == 9.0

    def test_no_scores(self):
        scores = summarize_scores([], CFG)
        assert scores["official"] is None and scores["ai"] is None
        assert len(scores["items"]["OGA"]) == len(CFG["grading"]["oga"]["items"])
        assert all(i["mark"] is None for i in scores["items"]["TDA"])


class TestStatus:
    def test_display_status(self):
        assert display_status("ready", True) == "completed"
        assert display_status("failed", True) == "completed"
        assert display_status("pending", False) == "pending"
        assert display_status("failed", False) == "pending"
        assert display_status("ready", False) == "in_review"

    def test_stale_pending_becomes_failed(self):
        now = datetime(2026, 11, 2, 12, 0)
        fresh = SimpleNamespace(generation_status="pending", updated_at=now - timedelta(minutes=2), created_at=now)
        stale = SimpleNamespace(generation_status="pending", updated_at=now - timedelta(hours=1), created_at=now)
        assert effective_generation_status(fresh, now) == "pending"
        assert effective_generation_status(stale, now) == "failed"


class TestVerdict:
    def test_most_severe_rule_wins(self):
        rules = [
            _rule("R-DELAY-1", "violated", summary="UC: 12"),
            _rule("R-FAIL-1", "violated", summary="OGA=4.0"),
        ]
        verdict = compute_verdict(rules, None)
        assert verdict["code"] == "banned"
        assert verdict["reasons"] == ["R-FAIL-1 (OGA=4.0)"]
        assert verdict["is_official"] is False

    def test_rejected_violation_is_ignored(self):
        verdict = compute_verdict([_rule("R-DELAY-3", "violated", decision="reject")], None)
        assert verdict["code"] == "insufficient_data"

    def test_committee_confirmed_rule(self):
        verdict = compute_verdict([_rule("R-INDIV", "na", needs_human=True, decision="confirm")], None)
        assert verdict["code"] == "fail_individual"

    def test_pass_and_fail_from_official_scores(self):
        good = summarize_scores(_all_items("oga", 8) + _all_items("tda", 8), CFG)["official"]
        assert compute_verdict([], good)["code"] == "pass"
        # final = 6×50% + 2×50% = 4 < 5
        low = summarize_scores(_all_items("oga", 6) + _all_items("tda", 2), CFG)["official"]
        assert compute_verdict([], low)["code"] == "fail"

    def test_oga_below_min_is_banned(self):
        official = summarize_scores([_score("OGA", "srs", 3)], CFG)["official"]
        assert compute_verdict([], official)["code"] == "banned"

    def test_partial_scores_are_insufficient(self):
        official = summarize_scores([_score("TDA", "srs", 8)], CFG)["official"]
        verdict = compute_verdict([], official)
        assert verdict["code"] == "insufficient_data"
        assert "TDA" in verdict["reasons"][0]


class TestRubricView:
    def test_labels_and_weights_from_rubric_config(self):
        view = rubric_view(RUBRIC)
        tda = next(g for g in view["groups"] if g["group"] == "TDA")
        assert {i["code"]: i["label"] for i in tda["items"]}["qa"] == "Q&A"
        assert sum(i["weight"] for i in tda["items"]) == 100
        assert [c["key"] for c in view["quality_criteria"]] == [c["key"] for c in CFG["quality_criteria"]]

    def test_rubric_edit_is_reflected(self):
        # BR-A1: sửa rubric trong DB → dữ liệu trả cho UI đổi theo, không sửa code
        cfg = copy.deepcopy(CFG)
        cfg["grading"]["tda"]["items"]["qa"] = 20
        cfg["item_labels"]["qa"] = "Hỏi đáp"
        view = rubric_view(SimpleNamespace(key="k", name="n", version="2", config=cfg))
        qa = next(i for g in view["groups"] if g["group"] == "TDA" for i in g["items"] if i["code"] == "qa")
        assert qa == {"code": "qa", "label": "Hỏi đáp", "weight": 20}

    def test_falls_back_to_code_without_labels(self):
        cfg = {k: v for k, v in CFG.items() if k != "item_labels"}
        view = rubric_view(SimpleNamespace(key="k", name="n", version="1", config=cfg))
        item = view["groups"][0]["items"][0]
        assert item["label"] == item["code"]

    def test_item_order_survives_jsonb_key_reordering(self):
        # Cột JSONB: Postgres sắp lại key theo độ dài ("qa", "pmp", ...) khi ghi
        cfg = copy.deepcopy(CFG)
        for group in ("oga", "tda"):
            items = cfg["grading"][group]["items"]
            cfg["grading"][group]["items"] = dict(sorted(items.items(), key=lambda kv: (len(kv[0]), kv[0])))
        view = rubric_view(SimpleNamespace(key="k", name="n", version="1", config=cfg))
        tda = next(g for g in view["groups"] if g["group"] == "TDA")
        assert [i["code"] for i in tda["items"]] == cfg["item_order"]
        oga_codes = [i["code"] for i in summarize_scores([], cfg)["items"]["OGA"]]
        assert oga_codes == [c for c in cfg["item_order"] if c in cfg["grading"]["oga"]["items"]]

    def test_items_missing_from_item_order_go_last(self):
        cfg = copy.deepcopy(CFG)
        cfg["grading"]["tda"]["items"] = {"demo": 5, **cfg["grading"]["tda"]["items"]}
        codes = [code for code, _ in group_items(cfg, "tda")]
        assert codes == cfg["item_order"] + ["demo"]


class TestReviewView:
    @staticmethod
    def _report(clo_breakdown):
        return SimpleNamespace(
            ai_feedback="Nhận xét", quality_criteria=[], strengths=[], weaknesses=[],
            action_items=[], clo_breakdown=clo_breakdown,
        )

    def test_lists_unmentioned_clos_as_not_covered(self):
        stored = [{"clo": "CLO2", "covered": True, "comment": "Hỏi kiến trúc"}]
        clo = review_view(self._report(stored), CFG)["clo_coverage"]
        assert [c["clo"] for c in clo] == [c["code"] for c in CFG["clo"]]
        assert clo[1] == {**stored[0], "desc": CFG["clo"][1]["desc"]}
        assert not any(c["covered"] for c in clo if c["clo"] != "CLO2")

    def test_no_clo_section_when_ai_returned_none(self):
        assert review_view(self._report([]), CFG)["clo_coverage"] == []


class TestShortTitle:
    def test_keeps_short_title(self):
        assert short_title("  Đặt lịch   phòng lab ") == "Đặt lịch phòng lab"

    def test_cuts_long_title_at_word_boundary(self):
        title = (
            "Dạ, đề tài của nhóm em là hệ thống đặt lịch phòng lab cho khoa. "
            "Hiện tại sinh viên phải nhắn tin cho"
        )
        short = short_title(title)
        assert short.endswith("…") and len(short) <= 81
        assert title.startswith(short[:-1])
        assert title[len(short) - 1] == " "  # cắt đúng chỗ khoảng trắng, không đứt giữa chữ


class TestPrompt:
    def test_prompt_uses_rubric_and_forbids_scores(self):
        system, user = build_report_prompts(CFG, "[Sinh viên]: em xin trình bày", "")
        for criterion in CFG["quality_criteria"]:
            assert criterion["key"] in user
        assert "Đạt / Khá / Chưa đạt" in user
        assert "KHÔNG chấm điểm số" in system
        assert "TRÍCH ĐOẠN" not in user
        _, with_doc = build_report_prompts(CFG, "[Sinh viên]: ...", "Chương 1: SRS")
        assert "Chương 1: SRS" in with_doc
