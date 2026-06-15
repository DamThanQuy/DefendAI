"""
AI Gateway - điều phối giữa nhiều LLM provider.

Hỗ trợ 2 provider (GĐ1):
- NVIDIA NIM (model lớn - Step-3.7-Flash, dùng cho task phức tạp)
- Google AI Studio (model worker - Gemma 4 31B IT, dùng cho task nhanh)

Public API:
- AIGateway: class chính, quản lý providers
- ai_gateway: singleton instance

Cách dùng:
    from app.services.ai_client import ai_gateway
    
    # Gọi provider mặc định (google)
    result = await ai_gateway.generate(prompt="Hello")
    
    # Gọi provider cụ thể
    result = await ai_gateway.generate(prompt="Hello", provider="nvidia")
    
    # Gọi model cụ thể
    result = await ai_gateway.generate(prompt="Hello", model="gemma-4-26b-a4b-it")
    
    # Helper: gọi model lớn (orchestrator)
    result = await ai_gateway.orchestrate(prompt="Phân tích tài liệu...")
    
    # Helper: gọi model worker
    result = await ai_gateway.worker(prompt="Extract keywords...")
"""
import logging
import os
from typing import Any

from app.core.config import settings
from app.services.ai_providers import NVIDIAProvider, GoogleProvider


logger = logging.getLogger(__name__)


class AIGateway:
    """
    Gateway điều phối giữa nhiều AI provider.

    Singleton pattern - import `ai_gateway` ở cuối file.
    """

    def __init__(self) -> None:
        self.providers: dict[str, Any] = {}
        self._configure()

    def _configure(self) -> None:
        """
        Khởi tạo các provider có API key thật.
        Bỏ qua nếu key là PLACEHOLDER (chưa inject).
        """
        nvidia_api_key = self._env_value("NVIDIA_API_KEY")
        nvidia_base_url = self._env_value("NVIDIA_BASE_URL", settings.nvidia.base_url)
        nvidia_model = self._env_value("NVIDIA_MODEL", settings.nvidia.model)

        google_api_key = self._env_value("GOOGLE_API_KEY")
        google_base_url = self._env_value("GOOGLE_BASE_URL", settings.google.base_url)
        google_model = self._env_value("GOOGLE_MODEL", settings.google.model)

        # NVIDIA NIM
        if nvidia_api_key and not self._is_placeholder(nvidia_api_key):
            try:
                self.providers["nvidia"] = NVIDIAProvider(
                    api_key=nvidia_api_key,
                    base_url=nvidia_base_url,
                    model=nvidia_model,
                )
                logger.info(
                    "✓ NVIDIA provider ready | model=%s | base_url=%s",
                    nvidia_model,
                    nvidia_base_url,
                )
            except Exception as e:
                logger.warning("✗ NVIDIA provider failed to init: %s", e)
        else:
            logger.info("⊘ NVIDIA provider skipped (no API key or PLACEHOLDER)")

        # Google AI Studio
        if google_api_key and not self._is_placeholder(google_api_key):
            try:
                self.providers["google"] = GoogleProvider(
                    api_key=google_api_key,
                    base_url=google_base_url,
                    model=google_model,
                )
                logger.info(
                    "✓ Google provider ready | model=%s | base_url=%s",
                    google_model,
                    google_base_url,
                )
            except Exception as e:
                logger.warning("✗ Google provider failed to init: %s", e)
        else:
            logger.info("⊘ Google provider skipped (no API key or PLACEHOLDER)")

        if not self.providers:
            logger.warning(
                "⚠ No AI provider configured! Set NVIDIA_API_KEY and/or GOOGLE_API_KEY in .env"
            )

    @staticmethod
    def _is_placeholder(value: str) -> bool:
        """Check xem value có phải placeholder không."""
        return "PLACEHOLDER" in value.upper() or not value.strip()

    @staticmethod
    def _env_value(name: str, default: str = "") -> str:
        value = os.getenv(name)
        # Nếu biến môi trường không tồn tại hoặc chỉ chứa chuỗi rỗng/khoảng trắng
        if value is None or not value.strip():
            return default
        return value.strip()

    # ========== Public API ==========

    def list_providers(self) -> dict[str, dict]:
        """
        Trả về thông tin các provider đang enabled.

        Returns:
            Dict mapping provider_name → {default_model, ready, base_url}
        """
        result = {}
        for name, provider in self.providers.items():
            cfg = getattr(settings, name, None)
            result[name] = {
                "default_model": provider.get_default_model(),
                "ready": True,
                "base_url": cfg.base_url if cfg else None,
            }
        return result

    def list_all_models(self) -> dict[str, list[str]]:
        """
        Trả về danh sách model gợi ý cho mỗi provider.
        (Không gọi API, chỉ list model khả dụng theo docs)
        """
        return {
            "nvidia": [
                "stepfun-ai/Step-3.7-Flash",  # Default
                "meta/llama-3.1-70b-instruct",
                "mistralai/mistral-large-2-instruct",
            ],
            "google": [
                "gemma-4-31b-it",  # Default
                "gemma-4-26b-a4b-it",  # MoE - nhanh hơn
                "gemma-4-e4b-it",  # Nhỏ, rất nhanh
                "gemini-2.0-flash",
                "gemini-2.5-pro",
            ],
        }

    async def generate(
        self,
        *,
        prompt: str,
        provider: str | None = None,
        model: str | None = None,
        system_prompt: str = "",
        **kwargs: Any,
    ) -> dict[str, Any]:
        """
        Gọi 1 provider cụ thể. Nếu không chỉ định → dùng default.

        Args:
            prompt: User prompt (required)
            provider: tên provider ("nvidia" | "google"). Mặc định: settings.routing.default_provider
            model: model ID. Mặc định: provider's default model
            system_prompt: System instruction
            **kwargs: truyền thẳng vào provider.generate (temperature, max_tokens, ...)

        Returns:
            Dict: {provider, model, content, usage, latency_ms, raw}

        Raises:
            RuntimeError: nếu provider không available
            ValueError: nếu prompt rỗng
        """
        provider_name = provider or settings.routing.default_provider

        if provider_name not in self.providers:
            available = sorted(self.providers.keys())
            raise RuntimeError(
                f"Provider '{provider_name}' not available. "
                f"Available: {available or 'NONE - check your API keys in .env'}"
            )

        return await self.providers[provider_name].generate(
            prompt=prompt,
            model=model,
            system_prompt=system_prompt,
            **kwargs,
        )

    async def orchestrate(self, prompt: str, **kwargs: Any) -> dict[str, Any]:
        """
        Helper: gọi model lớn (orchestrator) cho task phức tạp.

        Mặc định dùng `settings.routing.orchestrator_provider` (NVIDIA Step 3.7).
        Hỗ trợ `reasoning_effort` (low | medium | high).
        """
        provider_name = settings.routing.orchestrator_provider
        if provider_name not in self.providers:
            # Fallback: dùng provider bất kỳ đang available
            if self.providers:
                provider_name = sorted(self.providers.keys())[0]
                logger.warning(
                    "Orchestrator provider '%s' not available, fallback to '%s'",
                    settings.routing.orchestrator_provider,
                    provider_name,
                )
            else:
                raise RuntimeError("No AI provider available for orchestration")
        return await self.generate(prompt=prompt, provider=provider_name, **kwargs)

    async def worker(self, prompt: str, **kwargs: Any) -> dict[str, Any]:
        """
        Helper: gọi model worker (nhanh) cho task phụ.

        Ưu tiên Google (nhanh hơn NVIDIA cho model nhỏ), fallback NVIDIA nếu Google không có.
        """
        if "google" in self.providers:
            return await self.generate(prompt=prompt, provider="google", **kwargs)
        if "nvidia" in self.providers:
            return await self.generate(prompt=prompt, provider="nvidia", **kwargs)
        raise RuntimeError("No AI provider available for worker tasks")


# Singleton instance - dùng chung toàn project
ai_gateway = AIGateway()