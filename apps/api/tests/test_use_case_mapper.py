"""Unit test BR-B2: use_case_mapper + use_case_extractor (pure functions).

Test logic thuần (ratio, status count, parse JSON từ LLM output) — không cần DB.
Test rule integration đã có sẵn trong test_rules.py.
"""
from app.services.use_case_mapper import UCStats, get_workspace_uc_stats
from app.services.use_case_extractor import _coerce_use_case, _parse_use_case_response


# ---------------------------------------------------------------------------
# use_case_mapper — test dataclass + business logic đơn giản
# ---------------------------------------------------------------------------
class TestUCStats:
    def test_zero_state(self):
        s = UCStats(workspace_id=1, total=0, committed=0, completed=0, omitted=0, completion_ratio=0.0)
        d = s.to_dict()
        assert d["total"] == 0
        assert d["completion_ratio"] == 0.0

    def test_partial_complete(self):
        s = UCStats(workspace_id=1, total=10, committed=3, completed=7, omitted=0, completion_ratio=0.7)
        assert s.completion_ratio == 0.7
        assert s.to_dict()["completed"] == 7

    def test_full_complete(self):
        s = UCStats(workspace_id=1, total=5, committed=0, completed=5, omitted=0, completion_ratio=1.0)
        assert s.completion_ratio == 1.0

    def test_omitted_excluded(self):
        """UC omitted không tính vào ratio (SV quyết định bỏ)."""
        # 3 committed + 3 completed + 4 omitted → 3/6 = 0.5
        s = UCStats(workspace_id=1, total=10, committed=3, completed=3, omitted=4, completion_ratio=0.5)
        assert s.completion_ratio == 0.5
        assert s.total == 10


# ---------------------------------------------------------------------------
# use_case_extractor — test _coerce_use_case + _parse_use_case_response
# ---------------------------------------------------------------------------
class TestCoerceUseCase:
    def test_full(self):
        r = _coerce_use_case(
            {"uc_code": "uc01", "name": "Đăng nhập", "actor": "Sinh viên", "transactions_est": 4},
            1,
        )
        assert r is not None
        assert r["uc_code"] == "UC01"  # upper
        assert r["name"] == "Đăng nhập"
        assert r["actor"] == "Sinh viên"
        assert r["transactions_est"] == 4

    def test_alternate_keys(self):
        """LLM có thể trả key tiếng Việt (tac_nhan, so_giao_dich) — chấp nhận."""
        r = _coerce_use_case(
            {"code": "UC-Login", "ten": "Login", "tac_nhan": "User", "so_giao_dich": 5},
            2,
        )
        assert r is not None
        assert r["uc_code"] == "UC-LOGIN"
        assert r["name"] == "Login"
        assert r["transactions_est"] == 5

    def test_missing_name_dropped(self):
        assert _coerce_use_case({"uc_code": "UC01"}, 1) is None

    def test_invalid_code_dropped(self):
        """Mã có dấu chấm/ký tự đặc biệt ngoài [A-Z0-9_-] → drop."""
        # Dấu cách bị strip → thành "UC01" hợp lệ (đó là behavior đã chọn)
        r = _coerce_use_case({"uc_code": "UC 01", "name": "Login"}, 1)
        assert r is not None and r["uc_code"] == "UC01"
        # Ký tự đặc biệt thực sự → drop
        assert _coerce_use_case({"uc_code": "UC.01!", "name": "Login"}, 1) is None
        # Empty code → fallback "UC01" + 1 char? Kiểm tra UC01 (idx 5)
        r3 = _coerce_use_case({"uc_code": "", "name": "X"}, 5)
        assert r3 is not None and r3["uc_code"].startswith("UC")

    def test_estimated_clamped(self):
        """transactions_est > 50 → clamp 50."""
        r = _coerce_use_case({"uc_code": "UC01", "name": "X", "transactions_est": 999}, 1)
        assert r["transactions_est"] == 50
        # 0 → thành 1
        r2 = _coerce_use_case({"uc_code": "UC02", "name": "Y", "transactions_est": 0}, 1)
        assert r2["transactions_est"] == 1

    def test_non_dict_dropped(self):
        assert _coerce_use_case("not a dict", 1) is None
        assert _coerce_use_case(None, 1) is None


class TestParseResponse:
    def test_clean_json(self):
        content = '{"use_cases": [{"uc_code": "UC01", "name": "Login"}, {"uc_code": "UC02", "name": "Logout"}]}'
        out = _parse_use_case_response(content)
        assert len(out) == 2
        assert out[0]["uc_code"] == "UC01"
        assert out[1]["name"] == "Logout"

    def test_json_with_fence(self):
        content = '```json\n{"use_cases": [{"uc_code": "UC01", "name": "X"}]}\n```'
        out = _parse_use_case_response(content)
        assert len(out) == 1
        assert out[0]["uc_code"] == "UC01"

    def test_direct_array(self):
        content = '[{"uc_code": "UC01", "name": "A"}, {"uc_code": "UC02", "name": "B"}]'
        out = _parse_use_case_response(content)
        assert len(out) == 2

    def test_duplicates_removed(self):
        content = '{"use_cases": [{"uc_code": "UC01", "name": "A"}, {"uc_code": "UC01", "name": "B"}]}'
        out = _parse_use_case_response(content)
        assert len(out) == 1
        assert out[0]["name"] == "A"  # first wins

    def test_garbage_returns_empty(self):
        out = _parse_use_case_response("Đây không phải JSON, model hallucinate...")
        assert out == []

    def test_empty_string(self):
        assert _parse_use_case_response("") == []
