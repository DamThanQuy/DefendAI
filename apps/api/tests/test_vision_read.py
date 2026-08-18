"""
Unit tests for vision_read.py (Gemini 3.1 Flash Lite vision reader).

Run from container: docker cp tests/test_vision_read.py defense-api:/app/tests/ && docker exec -e PYTHONPATH=/app -w /app defense-api python -m pytest tests/test_vision_read.py -v
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.vision_read import read_file, clear_cache, cache_stats, _rate_limiter, _cache, ReadResult


class TestVisionRead:
    @pytest.fixture(autouse=True)
    def setup_teardown(self):
        clear_cache()
        yield
        clear_cache()

    @pytest.mark.asyncio
    async def test_read_file_empty_bytes(self):
        """Empty bytes should return empty ReadResult without API call."""
        result = await read_file(b"", "application/pdf")
        assert result == ReadResult(text="", diagrams=[])

    @pytest.mark.asyncio
    async def test_cache_hit(self):
        """Same file bytes should hit cache on second call."""
        file_bytes = b"test pdf content"
        mime = "application/pdf"

        with patch("app.services.vision_read._call_gemini_vision", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = ReadResult(text="extracted text", diagrams=["diag1"])
            
            # First call - should call API
            result1 = await read_file(file_bytes, mime)
            assert result1 == ReadResult(text="extracted text", diagrams=["diag1"])
            assert mock_call.call_count == 1

            # Second call - should hit cache
            result2 = await read_file(file_bytes, mime)
            assert result2 == ReadResult(text="extracted text", diagrams=["diag1"])
            assert mock_call.call_count == 1  # not called again

    @pytest.mark.asyncio
    async def test_cache_disabled(self):
        """use_cache=False should bypass cache."""
        file_bytes = b"test pdf content"
        mime = "application/pdf"

        with patch("app.services.vision_read._call_gemini_vision", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = ReadResult(text="extracted text", diagrams=[])
            
            await read_file(file_bytes, mime, use_cache=False)
            await read_file(file_bytes, mime, use_cache=False)
            assert mock_call.call_count == 2  # called both times

    @pytest.mark.asyncio
    async def test_different_files_different_cache(self):
        """Different file content should have different cache entries."""
        with patch("app.services.vision_read._call_gemini_vision", new_callable=AsyncMock) as mock_call:
            mock_call.side_effect = [
                ReadResult(text="text 1", diagrams=[]),
                ReadResult(text="text 2", diagrams=["d"]),
            ]
            
            await read_file(b"file 1", "application/pdf")
            await read_file(b"file 2", "application/pdf")
            assert mock_call.call_count == 2

    @pytest.mark.asyncio
    async def test_clear_cache(self):
        """clear_cache should empty the cache."""
        with patch("app.services.vision_read._call_gemini_vision", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = ReadResult(text="text", diagrams=[])
            
            await read_file(b"test", "application/pdf")
            assert cache_stats()["entries"] == 1
            
            clear_cache()
            assert cache_stats()["entries"] == 0

    @pytest.mark.asyncio
    async def test_cache_stats(self):
        """cache_stats should return correct counts."""
        clear_cache()
        assert cache_stats() == {"entries": 0, "total_chars": 0, "total_diagrams": 0}
        
        with patch("app.services.vision_read._call_gemini_vision", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = ReadResult(text="hello world", diagrams=["d1", "d2"])
            await read_file(b"test", "application/pdf")
            
            stats = cache_stats()
            assert stats["entries"] == 1
            assert stats["total_chars"] == 11  # "hello world"
            assert stats["total_diagrams"] == 2

    @pytest.mark.asyncio
    async def test_rate_limiter_allows_burst(self):
        """Token bucket should allow initial burst of 15 requests."""
        # Take all 15 tokens quickly
        for _ in range(15):
            await _rate_limiter.take()
        
        # 16th should wait (we can't easily test timing in unit test, but bucket should be empty)
        assert _rate_limiter._tokens < 1


class TestVisionReadIntegration:
    """Integration-style tests (require real API key - skipped by default)."""
    
    @pytest.mark.skip(reason="Requires real API key and network")
    @pytest.mark.asyncio
    async def test_real_pdf_extraction(self):
        """Test with a real small PDF file."""
        # This would be run manually with a test PDF
        pass

    @pytest.mark.skip(reason="Requires real API key and network")
    @pytest.mark.asyncio
    async def test_real_docx_extraction(self):
        pass

    @pytest.mark.skip(reason="Requires real API key and network")
    @pytest.mark.asyncio
    async def test_rate_limit_enforcement(self):
        """Verify 429 handling works."""
        pass