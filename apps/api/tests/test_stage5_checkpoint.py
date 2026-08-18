"""
Checkpoint 5 verification — run against real report-cua-long.docx inside container.

Verifies:
1. Vision reader is called (PRIMARY path)
2. Returns text + diagrams (ReadResult / ParseResult)
3. JSON schema parsed correctly
4. No 429 error

Run manually inside container:
  PYTHONPATH=/app python -m pytest tests/test_stage5_checkpoint.py -v -s
"""
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.document import DocType, Document
from app.services.document_parser import extract_text
from app.services.vision_read import read_file as vision_read_file, ReadResult


TEST_FILE = "/app/report-cua-long.docx"


@pytest.mark.skipif(not os.path.exists(TEST_FILE), reason=f"Test file not found: {TEST_FILE}")
@pytest.mark.asyncio
async def test_real_docx_vision_extraction():
    """Verify Gemini returns structured {text, diagrams} from real docx."""
    file_bytes = Path(TEST_FILE).read_bytes()
    print(f"\nFile size: {len(file_bytes):,} bytes")

    result = await vision_read_file(
        file_bytes,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    print(f"Vision text: {len(result.text):,} chars")
    print(f"Diagrams found: {len(result.diagrams)}")
    for i, d in enumerate(result.diagrams[:3]):
        print(f"  Diagram {i+1}: {d[:200]}...")

    # Verify structured output
    assert isinstance(result, ReadResult), "Should return ReadResult"
    assert len(result.text) > 100, f"Text too short ({len(result.text)} chars)"
    # File is English SRS — check meaningful content present
    lower = result.text.lower()
    assert any(t in lower for t in ["requirement", "system", "functional", "software"]), \
        "Text doesn't look like SRS content"

    # Clear cache so next run hits API again (avoid stale "")
    from app.services.vision_read import clear_cache
    clear_cache()


@pytest.mark.asyncio
async def test_real_docx_via_extract_text():
    """Verify extract_text() routes docx through vision reader, returns ParseResult."""
    if not os.path.exists(TEST_FILE):
        pytest.skip(f"Test file not found: {TEST_FILE}")

    file_bytes = Path(TEST_FILE).read_bytes()

    mock_doc = MagicMock(spec=Document)
    mock_doc.id = 999
    mock_doc.doc_type = DocType.DOCX
    mock_doc.storage_key = "report-cua-long.docx"

    call_count = 0
    original_vision = vision_read_file

    async def tracking_vision(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return await original_vision(*args, **kwargs)

    with patch("app.services.document_parser.get_doc", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = file_bytes

        with patch("app.services.document_parser.vision_read_file", side_effect=tracking_vision):
            result = await extract_text(mock_doc)

    print(f"\nextract_text() called vision {call_count} time(s)")
    print(f"Extracted: {len(result.text):,} chars, {len(result.diagrams)} diagrams")
    assert call_count == 1, "Vision reader should be called exactly once (PRIMARY path)"
    assert len(result.text) > 0, "Should extract some text"
    assert isinstance(result.diagrams, list)

    from app.services.vision_read import clear_cache
    clear_cache()