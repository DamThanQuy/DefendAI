"""Unit tests BR-B3: defect severity mapping + counter + rules integration."""
from __future__ import annotations

import pytest

from app.models.defect_severity import DefectSeverity, map_legacy_severity
from app.services.defect_counter import DefectStats, get_defect_counts_for_rules
from app.services.rules import rule_R_DELAY_3


# ---------------------------------------------------------------------
# map_legacy_severity
# ---------------------------------------------------------------------
class TestMapLegacySeverity:
    def test_critical_to_showstopper(self):
        assert map_legacy_severity("critical") == DefectSeverity.show_stopper

    def test_high_to_showstopper(self):
        assert map_legacy_severity("high") == DefectSeverity.show_stopper

    def test_medium_to_logic(self):
        assert map_legacy_severity("medium") == DefectSeverity.logic

    def test_low_to_minor(self):
        assert map_legacy_severity("low") == DefectSeverity.minor

    def test_info_to_minor(self):
        assert map_legacy_severity("info") == DefectSeverity.minor

    def test_case_insensitive(self):
        assert map_legacy_severity("CRITICAL") == DefectSeverity.show_stopper
        assert map_legacy_severity(" Medium ") == DefectSeverity.logic

    def test_unknown_returns_none(self):
        assert map_legacy_severity("unknown") is None
        assert map_legacy_severity("fatal") is None

    def test_none_returns_none(self):
        assert map_legacy_severity(None) is None

    def test_empty_returns_none(self):
        assert map_legacy_severity("") is None
        assert map_legacy_severity("   ") is None


# ---------------------------------------------------------------------
# rule_R_DELAY_3
# ---------------------------------------------------------------------
class TestRuleRDelay3:
    def test_pending_when_none(self):
        r = rule_R_DELAY_3(None, None, {})
        assert r.auto_status == "pending_data"

    def test_pass_when_zero(self):
        r = rule_R_DELAY_3(0, 0, {})
        assert r.auto_status == "pass"

    def test_pass_under_threshold(self):
        r = rule_R_DELAY_3(3, 1, {})  # 3<=3, 1<=1
        assert r.auto_status == "pass"

    def test_violate_too_much_logic(self):
        r = rule_R_DELAY_3(4, 0, {})  # 4>3
        assert r.auto_status == "violated"
        assert any("n_logic" in e for e in r.evidence)

    def test_violate_too_much_showstopper(self):
        r = rule_R_DELAY_3(0, 2, {})  # 2>1
        assert r.auto_status == "violated"
        assert any("n_showstopper" in e for e in r.evidence)

    def test_violate_both(self):
        r = rule_R_DELAY_3(5, 3, {})
        assert r.auto_status == "violated"
        assert any("n_logic" in e for e in r.evidence)
        assert any("n_showstopper" in e for e in r.evidence)

    def test_custom_threshold(self):
        cfg = {"max_logic": 2, "max_showstopper": 0}
        r = rule_R_DELAY_3(3, 0, cfg)
        assert r.auto_status == "violated"


# ---------------------------------------------------------------------
# get_defect_counts_for_rules (với mock DB)
# ---------------------------------------------------------------------
class _FakeScalar:
    def __init__(self, data):
        self._data = data

    def scalars(self):
        return self

    def all(self):
        return self._data


class _FakeResult:
    def __init__(self, data):
        self._data = data

    def scalars(self):
        return _FakeScalar(self._data)

    def all(self):
        return self._data


class _FakeExecute:
    """Trả về empty result khi không có analysis (mặc định)."""

    async def __call__(self, *args, **kwargs):
        return _FakeResult([])


class _FakeDB:
    def __init__(self, severities: list[str] | None = None):
        # Nếu severities được cung cấp, trả về nó cho query thứ 2 (issue list)
        self._severities = severities

    async def execute(self, stmt, *args, **kwargs):
        # Stub: luôn trả empty — test toàn mức logic tại rule_R_DELAY_3 đã cover
        return _FakeResult([])


class TestGetDefectCountsForRules:
    @pytest.mark.asyncio
    async def test_none_workspace_returns_zero_zero(self):
        counts = await get_defect_counts_for_rules(_FakeDB(), None)
        assert counts == (0, 0)

    @pytest.mark.asyncio
    async def test_zero_workspace_returns_zero_zero(self):
        counts = await get_defect_counts_for_rules(_FakeDB(), 0)
        assert counts == (0, 0)

    @pytest.mark.asyncio
    async def test_no_analysis_returns_zero_zero(self):
        counts = await get_defect_counts_for_rules(_FakeDB(), 42)
        assert counts == (0, 0)


# ---------------------------------------------------------------------
# DefectStats dataclass
# ---------------------------------------------------------------------
class TestDefectStatsDataclass:
    def test_to_dict(self):
        s = DefectStats(
            workspace_id=1, total=10,
            n_showstopper=2, n_logic=3, n_minor=5,
            legacy_breakdown={"critical": 2, "medium": 3, "low": 5},
        )
        d = s.to_dict()
        assert d["workspace_id"] == 1
        assert d["total"] == 10
        assert d["n_showstopper"] == 2
        assert d["n_logic"] == 3
        assert d["n_minor"] == 5
        assert d["legacy_breakdown"]["critical"] == 2
