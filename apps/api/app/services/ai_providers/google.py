"""
Google AI Studio provider - wrapper cho Gemini API (OpenAI-compatible endpoint).

Dùng cho model worker (Gemma 4 31B IT) - tasks nhanh: parse, classify, extract.

Docs: https://ai.google.dev/gemini-api/docs/openai
      https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api
Auth: Authorization: Bearer $GOOGLE_API_KEY
Endpoint: https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
"""
from app.core.config import settings
from app.services.ai_providers.base import OpenAICompatibleProvider


class GoogleProvider(OpenAICompatibleProvider):
    """
    Provider cho Google AI Studio (Gemma + Gemini models).

    Lưu ý khi dùng Gemma 4:
    - Bật thinking: thêm `<|think|>` vào đầu system prompt
    - Tắt thinking: bỏ `<|think|>` (mặc định)
    - Gemma 4 hỗ trợ native system role (khác Gemma 3)
    - Function calling: native support

    Models khả dụng trên Google AI Studio:
    - gemma-4-31b-it (Dense 30.7B) - mặc định
    - gemma-4-26b-a4b-it (MoE 26B/4B active) - nhanh hơn
    - gemma-4-e4b-it (Dense ~4.5B) - rất nhanh
    - gemma-4-e2b-it (Dense ~2.3B) - nhanh nhất
    - gemini-2.0-flash, gemini-2.5-pro, gemini-3.5-flash (nếu cần)
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
    ) -> None:
        super().__init__(
            api_key=api_key or settings.google.api_key,
            base_url=base_url or settings.google.base_url,
            provider_name="google",
        )
        self._model = "gemini-1.5-flash"

    def get_default_model(self) -> str:
        return self._model