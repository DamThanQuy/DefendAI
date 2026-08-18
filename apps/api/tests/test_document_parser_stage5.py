"""
Unit tests for Stage 5 routing in document_parser.extract_text.

Verifies: pdf/docx/pptx → PRIMARY via vision reader, parser as fallback.
zip/md → native parser only.

Run from container:
docker cp tests/test_document_parser_stage5.py defense-api:/app/tests/ && \
docker exec -e PYTHONPATH=/app -w /app defense-api python -m pytest tests/test_document_parser_stage5.py -v
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.models.document import DocType, Document
from app.services.document_parser import extract_text, DocumentParserError, ParseResult
from app.services.vision_read import ReadResult


def _make_doc(doc_type: DocType, storage_key: str = "doc.pdf") -> Document:
    doc = MagicMock(spec=Document)
    doc.id = 1
    doc.doc_type = doc_type
    doc.storage_key = storage_key
    doc.filename = storage_key
    return doc


class TestStage5Routing:
    @pytest.mark.asyncio
    async def test_pdf_primary_vision(self):
        """PDF → vision reader called, returns ParseResult with text + diagrams."""
        doc = _make_doc(DocType.PDF, "report.pdf")
        with patch("app.services.document_parser.get_doc", new_callable=AsyncMock) as mock_get, \
             patch("app.services.document_parser.vision_read_file", new_callable=AsyncMock) as mock_vision:
            mock_get.return_value = b"%PDF fake bytes"
            mock_vision.return_value = ReadResult(text="Gemini text", diagrams=["ERD diagram"])

            result = await extract_text(doc)

            mock_vision.assert_called_once()
            assert result == ParseResult(text="Gemini text", diagrams=["ERD diagram"])

    @pytest.mark.asyncio
    async def test_docx_primary_vision(self):
        """DOCX → vision reader called as primary (Option B: images + native text)."""
        doc = _make_doc(DocType.DOCX, "report.docx")
        with patch("app.services.document_parser.get_doc", new_callable=AsyncMock) as mock_get, \
             patch("app.services.document_parser.vision_read_file", new_callable=AsyncMock) as mock_vision, \
             patch("app.services.document_parser._extract_office_images", return_value=[]) as mock_imgs, \
             patch("app.services.document_parser._extract_office_text", return_value="Native text") as mock_txt:
            mock_get.return_value = b"PK fake docx"
            mock_vision.return_value = ReadResult(text="", diagrams=[])

            result = await extract_text(doc)

            mock_vision.assert_not_called()  # no images → vision skipped, native text used
            mock_imgs.assert_called_once()
            mock_txt.assert_called_once()
            assert result == ParseResult(text="Native text", diagrams=[])

    @pytest.mark.asyncio
    async def test_pptx_primary_vision(self):
        """PPTX → vision reader called as primary (Option B: images + native text)."""
        doc = _make_doc(DocType.PPTX, "slides.pptx")
        with patch("app.services.document_parser.get_doc", new_callable=AsyncMock) as mock_get, \
             patch("app.services.document_parser.vision_read_file", new_callable=AsyncMock) as mock_vision, \
             patch("app.services.document_parser._extract_office_images", return_value=[]) as mock_imgs, \
             patch("app.services.document_parser._extract_office_text", return_value="Native text") as mock_txt:
            mock_get.return_value = b"PK fake pptx"
            mock_vision.return_value = ReadResult(text="", diagrams=[])

            result = await extract_text(doc)

            mock_vision.assert_not_called()  # no images → vision skipped, native text used
            mock_imgs.assert_called_once()
            mock_txt.assert_called_once()
            assert result == ParseResult(text="Native text", diagrams=[])

    @pytest.mark.asyncio
    async def test_vision_empty_falls_back_to_parser(self):
        """Vision returns empty → native parser used, diagrams=[]."""
        doc = _make_doc(DocType.PDF, "report.pdf")
        mock_pdf = MagicMock(return_value="Native PDF text")
        with patch("app.services.document_parser.get_doc", new_callable=AsyncMock) as mock_get, \
             patch("app.services.document_parser.vision_read_file", new_callable=AsyncMock) as mock_vision, \
             patch("app.services.document_parser._EXTRACTORS", {DocType.PDF: mock_pdf}):
            mock_get.return_value = b"%PDF fake"
            mock_vision.return_value = ReadResult(text="", diagrams=[])  # vision empty

            result = await extract_text(doc)

            mock_vision.assert_called_once()
            mock_pdf.assert_called_once()
            assert result == ParseResult(text="Native PDF text", diagrams=[])

    @pytest.mark.asyncio
    async def test_vision_failure_falls_back_to_parser(self):
        """Vision raises → native text used, diagrams=[] (Option B: vision only describes images)."""
        doc = _make_doc(DocType.DOCX, "report.docx")
        with patch("app.services.document_parser.get_doc", new_callable=AsyncMock) as mock_get, \
             patch("app.services.document_parser.vision_read_file", new_callable=AsyncMock) as mock_vision, \
             patch("app.services.document_parser._extract_office_images", return_value=[
                 MagicMock(data=b"img", mime_type="image/png")]) as mock_imgs, \
             patch("app.services.document_parser._extract_office_text", return_value="Native DOCX text") as mock_txt:
            mock_get.return_value = b"PK fake"
            mock_vision.side_effect = Exception("429 rate limit")

            result = await extract_text(doc)

            mock_vision.assert_called_once()  # vision attempted (images present)
            mock_imgs.assert_called_once()
            mock_txt.assert_called_once()
            # On vision failure, native text is returned (diagrams=[])
            assert result == ParseResult(text="Native DOCX text", diagrams=[])

    @pytest.mark.asyncio
    async def test_zip_native_only_no_vision(self):
        """ZIP → native parser only, NO vision call."""
        doc = _make_doc(DocType.ZIP, "source.zip")
        mock_zip = MagicMock(return_value="Member1.java\nMember2.py")
        with patch("app.services.document_parser.get_doc", new_callable=AsyncMock) as mock_get, \
             patch("app.services.document_parser.vision_read_file", new_callable=AsyncMock) as mock_vision, \
             patch("app.services.document_parser._EXTRACTORS", {DocType.ZIP: mock_zip}):
            mock_get.return_value = b"PK fake zip"

            result = await extract_text(doc)

            mock_vision.assert_not_called()
            mock_zip.assert_called_once()
            assert result == ParseResult(text="Member1.java\nMember2.py", diagrams=[])

    @pytest.mark.asyncio
    async def test_md_native_only_no_vision(self):
        """MD → decode directly, NO vision call."""
        doc = _make_doc(DocType.PDF, "readme.md")
        with patch("app.services.document_parser.get_doc", new_callable=AsyncMock) as mock_get, \
             patch("app.services.document_parser.vision_read_file", new_callable=AsyncMock) as mock_vision:
            mock_get.return_value = b"# Title\n\nSome markdown content"

            result = await extract_text(doc)

            mock_vision.assert_not_called()
            assert "Some markdown content" in result.text

    @pytest.mark.asyncio
    async def test_no_storage_key_raises(self):
        """Document without storage_key → DocumentParserError."""
        doc = _make_doc(DocType.PDF, "")
        doc.storage_key = None
        
        with pytest.raises(DocumentParserError):
            await extract_text(doc)

    @pytest.mark.asyncio
    async def test_docx_with_images_sends_multimodal_parts(self):
        """DOCX with embedded images → vision reader called with images + body_text (Option B)."""
        doc = _make_doc(DocType.DOCX, "report.docx")
        fake_docx = b"PK fake docx with media"
        with patch("app.services.document_parser.get_doc", new_callable=AsyncMock) as mock_get, \
             patch("app.services.document_parser.vision_read_file", new_callable=AsyncMock) as mock_vision, \
             patch("app.services.document_parser._extract_office_images", return_value=[
                 MagicMock(data=b"img1", mime_type="image/png"),
                 MagicMock(data=b"img2", mime_type="image/png"),
             ]) as mock_imgs, \
             patch("app.services.document_parser._extract_office_text", return_value="Native text") as mock_txt:
            mock_get.return_value = fake_docx
            mock_vision.return_value = ReadResult(text="", diagrams=["ERD diagram", "DFD diagram"])

            result = await extract_text(doc)

            # vision called once with images + body_text (not the old whole-file path)
            mock_vision.assert_called_once()
            _, kwargs = mock_vision.call_args
            assert kwargs.get("images") is not None and len(kwargs["images"]) == 2
            assert kwargs.get("body_text") == "Native text"
            # diagrams come from vision; text is the native text (authoritative)
            assert result.text == "Native text"
            assert result.diagrams == ["ERD diagram", "DFD diagram"]
            mock_imgs.assert_called_once()
            mock_txt.assert_called_once()

    @pytest.mark.asyncio
    async def test_docx_no_images_falls_back_to_native_text(self):
        """DOCX with no embedded images → vision skipped, native text used, diagrams=[]."""
        doc = _make_doc(DocType.DOCX, "report.docx")
        with patch("app.services.document_parser.get_doc", new_callable=AsyncMock) as mock_get, \
             patch("app.services.document_parser.vision_read_file", new_callable=AsyncMock) as mock_vision, \
             patch("app.services.document_parser._extract_office_images", return_value=[]) as mock_imgs, \
             patch("app.services.document_parser._extract_office_text", return_value="Only text") as mock_txt:
            mock_get.return_value = b"PK fake docx"

            result = await extract_text(doc)

            mock_vision.assert_not_called()  # nothing to describe
            assert result == ParseResult(text="Only text", diagrams=[])
            mock_imgs.assert_called_once()
            mock_txt.assert_called_once()

    @pytest.mark.asyncio
    async def test_pdf_still_uses_whole_file_path(self):
        """PDF → vision reader called WITHOUT images (Gemini renders PDF natively)."""
        doc = _make_doc(DocType.PDF, "report.pdf")
        with patch("app.services.document_parser.get_doc", new_callable=AsyncMock) as mock_get, \
             patch("app.services.document_parser.vision_read_file", new_callable=AsyncMock) as mock_vision:
            mock_get.return_value = b"%PDF fake"
            mock_vision.return_value = ReadResult(text="PDF text", diagrams=["seq diagram"])

            result = await extract_text(doc)

            mock_vision.assert_called_once()
            _, kwargs = mock_vision.call_args
            assert kwargs.get("images") is None  # PDF path: whole file, no separate images
            assert result == ParseResult(text="PDF text", diagrams=["seq diagram"])