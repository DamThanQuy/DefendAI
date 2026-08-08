"""
Local LLM provider - wrapper cho OpenAI-compatible local endpoint.

Dùng cho model chạy local (LM Studio, Ollama, vLLM, ...).

Auth: Authorization: Bearer $LOCAL_API_KEY
Endpoint: $LOCAL_BASE_URL/chat/completions
"""
from app.core.config import settings
from app.services.ai_providers.base import OpenAICompatibleProvider


class LocalProvider(OpenAICompatibleProvider):
    """
    Provider cho local LLM endpoint (OpenAI-compatible).

    Dùng model mặc định: "google" (model name tuỳ theo local server cấu hình).
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
    ) -> None:
        super().__init__(
            api_key=api_key or settings.local.api_key,
            base_url=base_url or settings.local.base_url,
            provider_name="localhost",
        )
        self._model = model or settings.local.model or "google"

    def get_default_model(self) -> str:
        return self._model
