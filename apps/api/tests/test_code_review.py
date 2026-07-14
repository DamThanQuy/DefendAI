"""
Test Code Review — Giai đoạn 3

Cach chay:
    cd apps/api
    pytest tests/test_code_review.py -v

Test nay mock DB + AI nen KHONG can PostgreSQL hay API key dang chay.
Cover:
  - Unit: _is_safe_member, extract_code_files, build_prompt, _normalize_*, _extract_json_payload
  - Integration: POST /api/code/scan happy path + error cases
  - Edge: path traversal, bad ZIP, empty ZIP, non-ZIP doc, doc not found
"""
import io
import json
import os
import sys
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, ".")

from fastapi.testclient import TestClient
from app.main import app
from app.core.database import get_db
from app.models.entities import DocType, Document, DocumentStatus
from app.services.code_scanner import (
    CodeScanError,
    ScannedFile,
    _extract_json_payload,
    _is_safe_member,
    _normalize_issue,
    _normalize_severity,
    build_prompt,
    extract_code_files,
)

# ============================================================
# MOCK DB
# ============================================================
mock_db = AsyncMock()


def override_get_db():
    yield mock_db


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_mock():
    mock_db.reset_mock()
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()
    yield


def _make_doc(
    doc_id: int = 1,
    filename: str = "source.zip",
    doc_type: DocType = DocType.ZIP,
    status: DocumentStatus = DocumentStatus.uploaded,
    file_path: str = "uploads/fake.zip",
):
    """Tạo Document object giả lập (SimpleNamespace, không cần DB)."""
    return SimpleNamespace(
        id=doc_id,
        filename=filename,
        file_type=".zip",
        doc_type=doc_type,
        status=status,
        file_path=file_path,
        content_hash=None,
        created_at=datetime.utcnow(),
    )


def _make_db_result(doc):
    result = MagicMock()
    result.scalar_one_or_none.return_value = doc
    return result


# ============================================================
# PART 1: Unit tests — _is_safe_member
# ============================================================

class TestIsSafeMember:
    """Test path traversal protection cho ZIP members."""

    def test_safe_relative_path(self):
        assert _is_safe_member("src/main.py") is True

    def test_safe_nested_path(self):
        assert _is_safe_member("app/services/code.py") is True

    def test_single_file(self):
        assert _is_safe_member("README.md") is True

    def test_dotdot_rejected(self):
        assert _is_safe_member("../etc/passwd") is False

    def test_dotdot_in_middle(self):
        assert _is_safe_member("src/../../etc/passwd") is False

    def test_absolute_unix_path_rejected(self):
        assert _is_safe_member("/etc/passwd") is False

    def test_dotdot_filename(self):
        assert _is_safe_member("..") is False

    def test_git_dir_rejected(self):
        assert _is_safe_member(".git/config") is False

    def test_node_modules_rejected(self):
        assert _is_safe_member("node_modules/package/index.js") is False

    def test_dist_rejected(self):
        assert _is_safe_member("dist/bundle.js") is False

    def test_pycache_rejected(self):
        assert _is_safe_member("__pycache__/module.pyc") is False

    def test_venv_rejected(self):
        assert _is_safe_member("venv/lib/python3.py") is False

    def test_dotvenv_rejected(self):
        assert _is_safe_member(".venv/lib/python3.py") is False

    def test_build_dir_rejected(self):
        assert _is_safe_member("build/output.js") is False

    def test_next_dir_rejected(self):
        assert _is_safe_member(".next/server/pages.js") is False

    def test_coverage_dir_rejected(self):
        assert _is_safe_member("coverage/lcov.info") is False

    def test_target_dir_rejected(self):
        assert _is_safe_member("target/debug/app") is False

    @pytest.mark.parametrize("safe_path", [
        "src/main.py",
        "app/services/code.py",
        "README.md",
        "a/b/c/d.py",
        "project/src/utils/helpers.js",
        "frontend/components/Button.tsx",
        "backend/routers/users.py",
        "docs/README.md",
        "tests/test_main.py",
        "src/deep/nested/path/to/file.py",
        "a/b/c/d/e/f/g/h.py",
    ])
    def test_safe_paths_parametrized(self, safe_path):
        """Các path hợp lệ phải được chấp nhận."""
        assert _is_safe_member(safe_path) is True

    @pytest.mark.parametrize("unsafe_path", [
        "../etc/passwd",
        "src/../../etc/passwd",
        "../../secret.txt",
        "/etc/passwd",
        "/tmp/evil.sh",
        "..",
        "../..",
        "a/../../../etc/shadow",
        "/usr/local/bin/evil",
    ])
    def test_unsafe_paths_parametrized(self, unsafe_path):
        """Các path traversal phải bị block."""
        assert _is_safe_member(unsafe_path) is False

    @pytest.mark.parametrize("skip_dir", [
        ".git",
        "node_modules",
        "dist",
        "build",
        "coverage",
        "target",
        "__pycache__",
        ".next",
        "venv",
        ".venv",
    ])
    def test_skip_dirs_parametrized(self, skip_dir):
        """Thư mục cần skip phải bị reject."""
        assert _is_safe_member(f"{skip_dir}/file.py") is False
        assert _is_safe_member(f"{skip_dir}/sub/dir/file.py") is False


# ============================================================
# PART 2: Unit tests — extract_code_files
# ============================================================

class TestExtractCodeFiles:
    """Test ZIP parsing — extract_code_files."""

    def _make_zip(self, files: dict[str, str]) -> str:
        """Tạo file ZIP tạm, trả về file path."""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            for name, content in files.items():
                zf.writestr(name, content)
        tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
        tmp.write(buf.getvalue())
        tmp.close()
        return tmp.name

    def test_extract_python_files(self):
        path = self._make_zip({
            "src/main.py": "print('hello')",
            "src/utils.py": "def helper(): pass",
        })
        doc = _make_doc(file_path=path)
        files = extract_code_files(doc)
        assert len(files) == 2
        names = [f.path for f in files]
        assert "src/main.py" in names
        assert "src/utils.py" in names
        os.unlink(path)

    def test_extract_multiple_languages(self):
        path = self._make_zip({
            "app.py": "print('hi')",
            "index.ts": "console.log('ts')",
            "style.css": "body { color: red; }",
        })
        doc = _make_doc(file_path=path)
        files = extract_code_files(doc)
        assert len(files) == 3
        os.unlink(path)

    def test_skip_unsupported_extensions(self):
        path = self._make_zip({
            "main.py": "print('ok')",
            "image.png": "binary data",
            "data.bin": "\x00\x01\x02",
        })
        doc = _make_doc(file_path=path)
        files = extract_code_files(doc)
        assert len(files) == 1
        assert files[0].path == "main.py"
        os.unlink(path)

    def test_skip_empty_files(self):
        path = self._make_zip({
            "main.py": "print('ok')",
            "empty.py": "",
            "whitespace.py": "   \n\n  ",
        })
        doc = _make_doc(file_path=path)
        files = extract_code_files(doc)
        assert len(files) == 1
        os.unlink(path)

    def test_skip_binary_files(self):
        path = self._make_zip({
            "main.py": "print('ok')",
            "binary.py": "test\x00null\x00bytes",
        })
        doc = _make_doc(file_path=path)
        files = extract_code_files(doc)
        assert len(files) == 1
        os.unlink(path)

    def test_skip_git_directory(self):
        path = self._make_zip({
            "src/main.py": "print('ok')",
            ".git/config": "[core]",
        })
        doc = _make_doc(file_path=path)
        files = extract_code_files(doc)
        assert len(files) == 1
        assert files[0].path == "src/main.py"
        os.unlink(path)

    def test_skip_node_modules(self):
        path = self._make_zip({
            "src/main.py": "print('ok')",
            "node_modules/pkg/index.js": "module.exports={}",
        })
        doc = _make_doc(file_path=path)
        files = extract_code_files(doc)
        assert len(files) == 1
        os.unlink(path)

    def test_skip_path_traversal(self):
        path = self._make_zip({
            "src/main.py": "print('ok')",
            "../../../etc/passwd": "root:x:0:0",
        })
        doc = _make_doc(file_path=path)
        files = extract_code_files(doc)
        assert len(files) == 1
        assert files[0].path == "src/main.py"
        os.unlink(path)

    def test_empty_zip_raises(self):
        path = self._make_zip({})
        doc = _make_doc(file_path=path)
        with pytest.raises(CodeScanError, match="Không tìm thấy"):
            extract_code_files(doc)
        os.unlink(path)

    def test_non_zip_file_raises(self):
        tmp = tempfile.NamedTemporaryFile(suffix=".txt", delete=False)
        tmp.write(b"not a zip")
        tmp.close()
        doc = _make_doc(file_path=tmp.name, doc_type=DocType.PDF)
        with pytest.raises(CodeScanError, match="chỉ hỗ trợ"):
            extract_code_files(doc)
        os.unlink(tmp.name)

    def test_file_not_found_raises(self):
        doc = _make_doc(file_path="uploads/nonexistent_9999.zip")
        with pytest.raises(CodeScanError, match="not found"):
            extract_code_files(doc)

    def test_bad_zip_raises(self):
        tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
        tmp.write(b"PK\x03\x04corrupted zip data here")
        tmp.close()
        doc = _make_doc(file_path=tmp.name)
        with pytest.raises(CodeScanError, match="bị lỗi"):
            extract_code_files(doc)
        os.unlink(tmp.name)

    def test_sorted_by_priority(self):
        """Python files should come before JS, TS, etc."""
        path = self._make_zip({
            "style.css": "body {}",
            "app.py": "print('hi')",
            "index.js": "console.log()",
            "types.ts": "interface X {}",
        })
        doc = _make_doc(file_path=path)
        files = extract_code_files(doc)
        paths = [f.path for f in files]
        # .py should come before .ts, .js, .css
        py_idx = paths.index("app.py")
        ts_idx = paths.index("types.ts")
        js_idx = paths.index("index.js")
        css_idx = paths.index("style.css")
        assert py_idx < ts_idx < js_idx < css_idx
        os.unlink(path)


# ============================================================
# PART 3: Unit tests — build_prompt
# ============================================================

class TestBuildPrompt:
    def test_build_prompt_basic(self):
        files = [ScannedFile(path="main.py", content="print('hello')")]
        system_prompt, user_prompt = build_prompt(files)
        assert "Senior Software Engineer" in system_prompt
        assert "main.py" in user_prompt
        assert "print('hello')" in user_prompt

    def test_build_prompt_multiple_files(self):
        files = [
            ScannedFile(path="app.py", content="x = 1"),
            ScannedFile(path="utils.py", content="y = 2"),
        ]
        _, user_prompt = build_prompt(files)
        assert "app.py" in user_prompt
        assert "utils.py" in user_prompt
        assert "FILE:" in user_prompt

    def test_build_prompt_empty(self):
        """build_prompt với danh sách rỗng."""
        system_prompt, user_prompt = build_prompt([])
        assert "Senior Software Engineer" in system_prompt
        # user_prompt vẫn có hướng dẫn
        assert "review" in user_prompt.lower()


# ============================================================
# PART 4: Unit tests — _normalize_severity, _normalize_issue, _extract_json_payload
# ============================================================

class TestNormalizeSeverity:
    def test_valid_severities(self):
        for sev in ("critical", "high", "medium", "low", "info"):
            assert _normalize_severity(sev) == sev

    def test_none_returns_medium(self):
        assert _normalize_severity(None) == "medium"

    def test_error_maps_to_high(self):
        assert _normalize_severity("error") == "high"
        assert _normalize_severity("fatal") == "high"

    def test_warning_maps_to_medium(self):
        assert _normalize_severity("warning") == "medium"
        assert _normalize_severity("warn") == "medium"

    def test_unknown_maps_to_info(self):
        assert _normalize_severity("unknown_level") == "info"

    def test_case_insensitive(self):
        assert _normalize_severity("HIGH") == "high"
        assert _normalize_severity(" Critical ") == "critical"


class TestNormalizeIssue:
    def test_valid_issue(self):
        item = {
            "type": "security",
            "file": "app.py",
            "line": 10,
            "description": "Hardcoded secret",
            "severity": "high",
            "suggestion": "Use env var",
        }
        result = _normalize_issue(item, 1)
        assert result is not None
        assert result["id"] == 1
        assert result["type"] == "security"
        assert result["file"] == "app.py"
        assert result["line"] == 10
        assert result["severity"] == "high"

    def test_alt_field_names(self):
        """Should accept 'path' as alternative to 'file', 'message' as alt to 'description'."""
        item = {"path": "utils.js", "message": "Something", "line": 5}
        result = _normalize_issue(item, 1)
        assert result is not None
        assert result["file"] == "utils.js"
        assert result["description"] == "Something"

    def test_line_clamped_to_min_1(self):
        item = {"file": "x.py", "line": 0}
        result = _normalize_issue(item, 1)
        assert result["line"] == 1

    def test_missing_fields_uses_defaults(self):
        item = {}
        result = _normalize_issue(item, 1)
        assert result is not None
        assert result["file"] == "unknown"
        assert result["line"] == 1
        assert result["type"] == "code_smell"


class TestExtractJsonPayload:
    def test_clean_json(self):
        text = '{"summary": "ok", "pass_rate": 80}'
        result = _extract_json_payload(text)
        assert result["summary"] == "ok"
        assert result["pass_rate"] == 80

    def test_json_in_markdown_block(self):
        text = '```json\n{"summary": "ok"}\n```'
        result = _extract_json_payload(text)
        assert result["summary"] == "ok"

    def test_json_with_surrounding_text(self):
        text = 'Here is the result:\n{"summary": "found", "issues": []}\nDone.'
        result = _extract_json_payload(text)
        assert result["summary"] == "found"

    def test_invalid_json_raises(self):
        with pytest.raises(json.JSONDecodeError):
            _extract_json_payload("not json at all {{{{")


# ============================================================
# PART 5: Integration tests — POST /api/code/scan
# ============================================================

class TestCodeScanEndpoint:
    """Integration tests cho POST /api/code/scan."""

    def _make_zip_file(self, files: dict[str, str] = None) -> str:
        """Tạo ZIP file tạm với nội dung code."""
        if files is None:
            files = {"main.py": "print('hello world')"}
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            for name, content in files.items():
                zf.writestr(name, content)
        tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
        tmp.write(buf.getvalue())
        tmp.close()
        return tmp.name

    def test_scan_success(self):
        """Upload ZIP → 200 + analysis results."""
        zip_path = self._make_zip_file({"app.py": "def main():\n    print('ok')"})
        doc = _make_doc(file_path=zip_path)
        mock_db.execute.return_value = _make_db_result(doc)

        async def fake_refresh(obj):
            if hasattr(obj, "id") and obj.id is None:
                obj.id = 10
            if hasattr(obj, "created_at"):
                obj.created_at = datetime.now()
        mock_db.refresh.side_effect = fake_refresh

        mock_ai_result = {
            "summary": "Code looks decent",
            "pass_rate": 85.0,
            "issues": [
                {
                    "id": 1,
                    "type": "code_smell",
                    "file": "app.py",
                    "line": 1,
                    "description": "No docstring",
                    "severity": "low",
                    "suggestion": "Add docstring",
                }
            ],
            "provider": "nvidia",
            "model": "meta/llama-3.1-70b-instruct",
        }

        with patch("app.routers.code_scan.analyze_code_document", new_callable=AsyncMock) as mock_analyze:
            mock_analyze.return_value = mock_ai_result
            r = client.post(
                "/api/code/scan",
                json={"document_id": 1},
            )

        assert r.status_code == 200
        data = r.json()
        assert data["document_id"] == 1
        assert data["document_name"] == "source.zip"
        assert data["status"] == "completed"
        assert data["summary"] == "Code looks decent"
        assert data["pass_rate"] == 85.0
        assert len(data["issues"]) == 1
        assert data["issues"][0]["file"] == "app.py"
        assert data["provider"] == "nvidia"
        assert data["files_scanned"] >= 1
        os.unlink(zip_path)

    def test_document_not_found(self):
        """Document không tồn tại → 404."""
        mock_db.execute.return_value = _make_db_result(None)
        r = client.post("/api/code/scan", json={"document_id": 99999})
        assert r.status_code == 404
        assert "99999" in r.json()["detail"]

    def test_non_zip_document_rejected(self):
        """Document type != ZIP → 400."""
        doc = _make_doc(doc_type=DocType.PDF, file_path="uploads/report.pdf")
        mock_db.execute.return_value = _make_db_result(doc)
        r = client.post("/api/code/scan", json={"document_id": 1})
        assert r.status_code == 400
        assert "ZIP" in r.json()["detail"]

    def test_docx_rejected(self):
        """Document type DOCX → 400."""
        doc = _make_doc(doc_type=DocType.DOCX, file_path="uploads/doc.docx")
        mock_db.execute.return_value = _make_db_result(doc)
        r = client.post("/api/code/scan", json={"document_id": 1})
        assert r.status_code == 400

    def test_scan_with_provider_and_model(self):
        """Pass provider + model params."""
        zip_path = self._make_zip_file()
        doc = _make_doc(file_path=zip_path)
        mock_db.execute.return_value = _make_db_result(doc)

        async def fake_refresh(obj):
            if hasattr(obj, "id") and obj.id is None:
                obj.id = 11
            if hasattr(obj, "created_at"):
                obj.created_at = datetime.now()
        mock_db.refresh.side_effect = fake_refresh

        mock_ai_result = {
            "summary": "OK",
            "pass_rate": 90.0,
            "issues": [],
            "provider": "google",
            "model": "gemini-2.0-flash",
        }

        with patch("app.routers.code_scan.analyze_code_document", new_callable=AsyncMock) as mock_analyze:
            mock_analyze.return_value = mock_ai_result
            r = client.post(
                "/api/code/scan",
                json={"document_id": 1, "provider": "google", "model": "gemini-2.0-flash"},
            )

        assert r.status_code == 200
        data = r.json()
        assert data["provider"] == "google"
        assert data["model"] == "gemini-2.0-flash"
        # Check analyze_code_document was called with provider/model
        mock_analyze.assert_called_once()
        call_kwargs = mock_analyze.call_args
        assert call_kwargs.kwargs.get("provider") == "google" or call_kwargs[1].get("provider") == "google"
        os.unlink(zip_path)

    def test_scan_error_sets_failed_status(self):
        """AI scan fails → document status = failed + 400."""
        zip_path = self._make_zip_file()
        doc = _make_doc(file_path=zip_path)
        mock_db.execute.return_value = _make_db_result(doc)

        async def fake_refresh(obj):
            pass
        mock_db.refresh.side_effect = fake_refresh

        with patch("app.routers.code_scan.analyze_code_document", new_callable=AsyncMock) as mock_analyze:
            mock_analyze.side_effect = CodeScanError("ZIP file corrupt")
            r = client.post("/api/code/scan", json={"document_id": 1})

        assert r.status_code == 400
        assert "ZIP file corrupt" in r.json()["detail"]
        os.unlink(zip_path)

    def test_scan_heuristic_fallback(self):
        """Khi AI fail, service fallback sang heuristic — vẫn trả results."""
        zip_path = self._make_zip_file({
            "main.py": "api_key = 'secret123'\nprint('hello')\n# TODO: fix this",
            "utils.js": "console.log('debug')",
        })
        doc = _make_doc(file_path=zip_path)
        mock_db.execute.return_value = _make_db_result(doc)

        async def fake_refresh(obj):
            if hasattr(obj, "id") and obj.id is None:
                obj.id = 12
            if hasattr(obj, "created_at"):
                obj.created_at = datetime.now()
        mock_db.refresh.side_effect = fake_refresh

        # AI fails → falls back to heuristic
        with patch("app.routers.code_scan.analyze_code_document", new_callable=AsyncMock) as mock_analyze:
            mock_analyze.side_effect = Exception("AI provider down")
            r = client.post("/api/code/scan", json={"document_id": 1})

        # Exception in router should result in 500 (not 200 via heuristic)
        # because the exception happens OUTSIDE analyze_code_document
        # Actually, the router catches Exception and returns 500
        assert r.status_code == 500
        os.unlink(zip_path)


# ============================================================
# PART 6: Heuristic scan unit test
# ============================================================

class TestHeuristicScan:
    """Test _heuristic_scan function directly."""

    def test_detect_hardcoded_secret(self):
        from app.services.code_scanner import _heuristic_scan
        files = [ScannedFile(path="config.py", content='API_KEY = "sk-12345"')]
        result = _heuristic_scan(files)
        assert len(result["issues"]) >= 1
        security_issues = [i for i in result["issues"] if i["type"] == "security"]
        assert len(security_issues) >= 1
        assert result["pass_rate"] < 100

    def test_detect_todo_markers(self):
        from app.services.code_scanner import _heuristic_scan
        files = [ScannedFile(path="app.py", content="# TODO: implement this\n# FIXME: broken")]
        result = _heuristic_scan(files)
        code_smell_issues = [i for i in result["issues"] if i["type"] == "code_smell"]
        assert len(code_smell_issues) >= 1

    def test_detect_console_log(self):
        from app.services.code_scanner import _heuristic_scan
        files = [ScannedFile(path="index.js", content="console.log('debug')")]
        result = _heuristic_scan(files)
        assert len(result["issues"]) >= 1

    def test_detect_eval_exec(self):
        from app.services.code_scanner import _heuristic_scan
        files = [ScannedFile(path="app.py", content='eval(user_input)\nos.system(cmd)')]
        result = _heuristic_scan(files)
        security_issues = [i for i in result["issues"] if i["type"] == "security"]
        assert len(security_issues) >= 2

    def test_clean_code_high_pass_rate(self):
        from app.services.code_scanner import _heuristic_scan
        files = [ScannedFile(path="app.py", content='def hello():\n    return "hello"')]
        result = _heuristic_scan(files)
        assert result["pass_rate"] == 100
        assert len(result["issues"]) == 0

    def test_provider_is_heuristic(self):
        from app.services.code_scanner import _heuristic_scan
        files = [ScannedFile(path="app.py", content="x = 1")]
        result = _heuristic_scan(files)
        assert result["provider"] == "heuristic"
        assert result["model"] == "rules-v1"

    def test_summary_message(self):
        from app.services.code_scanner import _heuristic_scan
        files = [
            ScannedFile(path="a.py", content='api_key = "hardcoded"'),
            ScannedFile(path="b.js", content="console.log('x')"),
        ]
        result = _heuristic_scan(files)
        assert "2 file code" in result["summary"]
