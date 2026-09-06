"""Unit tests cho source_item_builder helper (Option C refactor).

Pure function — không cần mock DB hay asyncio. Đây là "single source of
truth" cho shape `sources` trong response câu hỏi RAG.
"""
from __future__ import annotations

from app.services.source_item_builder import (
    build_display_title,
    normalize_doc_type,
    to_source_item,
    to_source_list,
)


class TestNormalizeDocType:
    def test_returns_raw_value_lowercased(self):
        assert normalize_doc_type("PDF", "x") == "pdf"
        assert normalize_doc_type("Docx", "x") == "docx"

    def test_falls_back_to_extension(self):
        # Chunk cũ không có meta->>'doc_type' → suy từ extension title
        assert normalize_doc_type(None, "rubric.md") == "markdown"
        assert normalize_doc_type("", "Spec.pdf") == "pdf"

    def test_other_string_falls_back(self):
        # 'other' = unknown, suy từ extension
        assert normalize_doc_type("other", "foo.docx") == "docx"

    def test_md_extension_maps_to_markdown(self):
        assert normalize_doc_type(None, "x.md") == "markdown"
        assert normalize_doc_type("", "x.MD") == "markdown"

    def test_unknown_extension_defaults_to_markdown(self):
        # Ref chunk không có extension → mặc định markdown
        assert normalize_doc_type(None, "Sep490 Rubric") == "markdown"
        assert normalize_doc_type("", "") == "markdown"


class TestBuildDisplayTitle:
    def test_keeps_existing_extension(self):
        assert build_display_title("rubric.md", "markdown") == "rubric.md"
        assert build_display_title("spec.pdf", "pdf") == "spec.pdf"

    def test_adds_md_for_markdown_without_ext(self):
        assert build_display_title("Sep490 Rubric", "markdown") == "Sep490 Rubric.md"

    def test_adds_extension_for_other_types(self):
        assert build_display_title("SourceCode", "pdf") == "SourceCode.pdf"

    def test_empty_title_returns_empty(self):
        assert build_display_title("", "markdown") == ""


class TestToSourceItem:
    def test_user_upload_with_filename_and_doc_type(self):
        raw = {
            "source": "user",
            "filename": "rubric.md",
            "doc_type": "markdown",
            "chunk_index": 3,
            "content": "# Hello\nworld",
        }
        item = to_source_item(1, raw)
        assert item == {
            "num": 1,
            "kind": "user_upload",
            "title": "rubric.md",
            "display_title": "rubric.md",
            "doc_type": "markdown",
            "is_markdown": True,
            "chunk_index": 3,
            "content": "# Hello\nworld",
        }

    def test_reference_chunk_without_doc_type_defaults_markdown(self):
        raw = {
            "source": "ref",
            "title": "Sep490 Rubric",
            "doc_type": None,  # reference_chunks không có cột này
            "chunk_index": 7,
            "content": "## UC-01",
        }
        item = to_source_item(2, raw)
        assert item["kind"] == "reference"
        assert item["title"] == "Sep490 Rubric"
        assert item["display_title"] == "Sep490 Rubric.md"  # auto-add ext
        assert item["doc_type"] == "markdown"
        assert item["is_markdown"] is True

    def test_filename_fallback_when_title_missing(self):
        # Một số query dùng 'filename' thay vì 'title'
        raw = {
            "source": "user",
            "filename": "doc.pdf",
            "doc_type": None,
            "chunk_index": 0,
            "content": "",
        }
        item = to_source_item(5, raw)
        assert item["title"] == "doc.pdf"
        assert item["display_title"] == "doc.pdf"
        assert item["doc_type"] == "pdf"
        assert item["is_markdown"] is False

    def test_empty_title_yields_empty_display(self):
        raw = {"source": "user", "filename": "", "doc_type": None, "content": ""}
        item = to_source_item(9, raw)
        assert item["title"] == ""
        assert item["display_title"] == ""

    def test_content_truncated_to_500_chars(self):
        long = "x" * 1000
        raw = {
            "source": "user",
            "filename": "x.md",
            "doc_type": "markdown",
            "content": long,
        }
        item = to_source_item(1, raw)
        assert len(item["content"]) == 500


class TestToSourceList:
    def test_numbers_items_one_indexed(self):
        results = [
            {"source": "user", "filename": "a.md", "doc_type": "markdown"},
            {"source": "ref", "title": "Sep490", "doc_type": None},
            {"source": "user", "filename": "b.pdf", "doc_type": "pdf"},
        ]
        items = to_source_list(results)
        assert [x["num"] for x in items] == [1, 2, 3]
        assert [x["kind"] for x in items] == ["user_upload", "reference", "user_upload"]

    def test_empty_list_returns_empty(self):
        assert to_source_list([]) == []
