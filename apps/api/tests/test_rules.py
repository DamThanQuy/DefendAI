"""Unit test BR-B1: rules service (agent đề xuất, hội đồng quyết).

Chạy: pytest tests/test_rules.py --capture=no
"""
from decimal import Decimal

from app.services.rules import (
    rule_R_FAIL_1,
    rule_R_DELAY_1,
    rule_R_DELAY_3,
    rule_R_DELAY_2,
    rule_R_REDO,
    rule_R_INDIV,
    rule_R_CAP,
)


SUBJECT = {"min_avg_to_pass": 5, "min_oga_to_pass": 5}


class TestRFAIL1:
    """R-FAIL-1: OGA < 5 → cấm bảo vệ."""

    def test_oga_49_violated(self):
        r = rule_R_FAIL_1(Decimal("4.9"), SUBJECT)
        assert r.auto_status == "violated"
        assert r.needs_human is False
        assert "4.9" in r.evidence[0]

    def test_oga_5_pass(self):
        r = rule_R_FAIL_1(Decimal("5.0"), SUBJECT)
        assert r.auto_status == "pass"

    def test_oga_7_pass(self):
        r = rule_R_FAIL_1(Decimal("7.0"), SUBJECT)
        assert r.auto_status == "pass"

    def test_no_score_pending(self):
        r = rule_R_FAIL_1(None, SUBJECT)
        assert r.auto_status == "pending_data"
        assert "threshold" in r.evidence[0]


class TestRDELAY1:
    """R-DELAY-1: UC<75% HOẶC <20 UC → hoãn vòng 2."""

    def test_ratio_low_violated(self):
        r = rule_R_DELAY_1(0.6, 25, {})
        assert r.auto_status == "violated"
        assert "60%" in r.evidence[0]

    def test_uc_low_violated(self):
        r = rule_R_DELAY_1(0.9, 15, {})
        assert r.auto_status == "violated"
        assert "15" in r.evidence[0]

    def test_both_violated(self):
        r = rule_R_DELAY_1(0.5, 10, {})
        assert r.auto_status == "violated"
        assert len(r.evidence) == 2

    def test_pass(self):
        r = rule_R_DELAY_1(0.9, 25, {})
        assert r.auto_status == "pass"

    def test_pending(self):
        r = rule_R_DELAY_1(None, None, {})
        assert r.auto_status == "pending_data"


class TestRDELAY3:
    """R-DELAY-3: >3 lỗi logic HOẶC >1 show-stopper → hoãn vòng 2."""

    def test_logic_high_violated(self):
        r = rule_R_DELAY_3(5, 0, {})
        assert r.auto_status == "violated"
        assert "n_logic" in r.evidence[0]

    def test_showstopper_high_violated(self):
        r = rule_R_DELAY_3(1, 2, {})
        assert r.auto_status == "violated"
        assert "showstopper" in r.evidence[0]

    def test_pass(self):
        r = rule_R_DELAY_3(2, 0, {})
        assert r.auto_status == "pass"

    def test_pending(self):
        r = rule_R_DELAY_3(None, None, {})
        assert r.auto_status == "pending_data"


class TestHumanOnly:
    """3 rule hội đồng-tick: luôn 'na', needs_human=True."""

    def test_delay2_na(self):
        r = rule_R_DELAY_2()
        assert r.auto_status == "na"
        assert r.needs_human is True

    def test_redo_na(self):
        r = rule_R_REDO()
        assert r.auto_status == "na"
        assert r.needs_human is True

    def test_indiv_na(self):
        r = rule_R_INDIV()
        assert r.auto_status == "na"
        assert r.needs_human is True

    def test_cap_disabled_na(self):
        r = rule_R_CAP(cap_enabled=False)
        assert r.auto_status == "na"
        assert r.needs_human is True
        assert "disabled" in r.input_summary

    def test_cap_enabled_pass(self):
        r = rule_R_CAP(cap_enabled=True)
        assert r.auto_status == "pass"
        assert r.needs_human is False
