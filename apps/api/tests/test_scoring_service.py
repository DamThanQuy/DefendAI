"""Unit test BR-A1: scoring service đọc rubric config, không hard-code.

Chạy: pytest tests/test_scoring_service.py --capture=no
"""
from decimal import Decimal

import pytest

from app.services.scoring_service import aggregate_student, final_score, group_score

# Rubric config tối giản đúng cấu trúc seed_rubrics.defense_sep490
RUBRIC = {
    "subject": {"scale": 10, "min_avg_to_pass": 5},
    "grading": {
        "oga": {
            "weight": 50,
            "items": {
                "introduction": 4, "pmp": 8, "srs": 16, "sdd": 18,
                "testing": 18, "user_guides": 4, "implementation": 32,
            },
        },
        "tda": {
            "weight": 50,
            "items": {
                "introduction": 5, "pmp": 5, "srs": 15, "sdd": 10,
                "testing": 10, "user_guides": 5, "implementation": 35,
                "presentation": 5, "qa": 10,
            },
        },
    },
}


def _full_marks(items: dict, value: float) -> dict:
    return {code: value for code in items}


class TestGroupScore:
    def test_uniform_marks_equal_mark(self):
        items = _full_marks(RUBRIC["grading"]["oga"]["items"], 7.0)
        res = group_score(items, RUBRIC["grading"]["oga"]["items"])
        assert res["score"] == 7.0
        assert res["missing_items"] == []

    def test_weighted_average(self):
        # introduction(4)=10, pmp(8)=5 → (40+40)/12 = 6.666… → round 6.7
        weights = RUBRIC["grading"]["oga"]["items"]
        res = group_score({"introduction": 10.0, "pmp": 5.0}, weights)
        assert res["score"] == 6.7
        assert res["scored_items"] == 2
        assert len(res["missing_items"]) == 5

    def test_no_items_returns_none(self):
        res = group_score({}, RUBRIC["grading"]["tda"]["items"])
        assert res["score"] is None


class TestFinalScore:
    def test_example_oga7_tda64_final67(self):
        """Nghiệm thu BR-A1: OGA 7.0 + TDA 6.4 → Final 6.7."""
        oga = _full_marks(RUBRIC["grading"]["oga"]["items"], 7.0)
        tda = _full_marks(RUBRIC["grading"]["tda"]["items"], 6.4)
        res = final_score(oga, tda, RUBRIC)
        assert res["oga"]["score"] == 7.0
        assert res["tda"]["score"] == 6.4
        assert res["final"] == 6.7
        assert res["verdict"] == "pass"

    def test_below_pass_mark_fails(self):
        # OGA 5.0 (không banned, = ngưỡng) + TDA 4.0 → final 4.5 < 5 → fail
        oga = _full_marks(RUBRIC["grading"]["oga"]["items"], 5.0)
        tda = _full_marks(RUBRIC["grading"]["tda"]["items"], 4.0)
        res = final_score(oga, tda, RUBRIC)
        assert res["final"] == 4.5
        assert res["verdict"] == "fail"

    def test_oga_below_5_banned_regardless_of_tda(self):
        """Syllabus §5.1: OGA < 5 → cấm bảo vệ (BR-B1 R-FAIL-1)."""
        oga = _full_marks(RUBRIC["grading"]["oga"]["items"], 4.9)
        tda = _full_marks(RUBRIC["grading"]["tda"]["items"], 9.0)
        res = final_score(oga, tda, RUBRIC)
        assert res["verdict"] == "banned_oga_below_min"

    def test_incomplete_when_tda_missing(self):
        oga = _full_marks(RUBRIC["grading"]["oga"]["items"], 7.0)
        res = final_score(oga, {}, RUBRIC)
        assert res["final"] is None
        assert res["verdict"] == "incomplete"

    def test_rounding_one_decimal_half_up(self):
        # OGA=6.65 (introduction 10 → 0.4; cho 2 mức để kiểm tra làm tròn)
        oga = {"introduction": 10.0, "pmp": 3.0, "srs": 7.0, "sdd": 7.0,
               "testing": 7.0, "user_guides": 7.0, "implementation": 7.0}
        tda = _full_marks(RUBRIC["grading"]["tda"]["items"], 7.0)
        res = final_score(oga, tda, RUBRIC)
        oga_score = Decimal(str(res["oga"]["score"]))
        assert oga_score == oga_score.quantize(Decimal("0.1"))  # đúng 1 chữ số


class TestAggregateStudent:
    def test_multi_reviewer_mean_then_weighted(self):
        """2 giám khảo cùng item → trung bình mark trước khi nhân weight."""
        rows = [
            ("TDA", "implementation", 8.0),
            ("TDA", "implementation", 6.0),  # mean = 7.0
        ] + [("OGA", c, 7.0) for c in RUBRIC["grading"]["oga"]["items"]]
        res = aggregate_student(rows, RUBRIC)
        assert res["tda"]["score"] is not None
        # TDA toàn bộ = 7 (chỉ 1 item có điểm → weighted avg = 7)
        assert res["tda"]["score"] == 7.0
        assert res["final"] == 7.0

    def test_empty_rows_incomplete(self):
        res = aggregate_student([], RUBRIC)
        assert res["verdict"] == "incomplete"
