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
    
    # Helper: gọi model worker
    result = await ai_gateway.worker(prompt="Extract keywords...")
"""
import logging
import os
from typing import Any

from app.core.config import settings
from app.services.ai_providers import NVIDIAProvider, LocalProvider


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
        Khởi tạo các provider từ settings object.
        """
        # Định nghĩa cấu hình cho các provider từ settings
        providers_meta = {
            "nvidia": {
                "class": NVIDIAProvider,
                "api_key": settings.nvidia.api_key,
                "base_url": settings.nvidia.base_url,
                "model": settings.nvidia.model
            },
            "localhost": {
                "class": LocalProvider,
                "api_key": settings.local.api_key,
                "base_url": settings.local.base_url,
                "model": settings.local.model
            }
        }

        for name, meta in providers_meta.items():
            key = meta["api_key"]
            if key and not self._is_placeholder(key):
                try:
                    # Khởi tạo provider với đầy đủ thông số
                    self.providers[name] = meta["class"](
                        api_key=key,
                        base_url=meta["base_url"],
                        model=meta["model"]
                    )
                    logger.info(f"✓ {name.upper()} provider ready | model={meta['model']}")
                except Exception as e:
                    logger.warning(f"✗ {name.upper()} init failed: {e}")
            else:
                logger.info(f"⊘ {name.upper()} provider skipped (missing API Key)")

        if not self.providers:
            logger.warning("⚠ No AI provider configured!")

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

    async def close(self) -> None:
        """Close all provider HTTP clients."""
        for name, provider in self.providers.items():
            if hasattr(provider, "close"):
                try:
                    await provider.close()
                    logger.info(f"Closed {name} provider HTTP client")
                except Exception as e:
                    logger.warning(f"Error closing {name} provider: {e}")

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
            "localhost": [
                "google",  # Default local model
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
            images=kwargs.pop("images", None),
            **kwargs,
        )

    def generate_stream(
        self,
        *,
        prompt: str,
        provider: str | None = None,
        model: str | None = None,
        system_prompt: str = "",
        **kwargs: Any,
    ):
        """
        Gọi provider với stream=True — trả async generator yield từng chunk
        {"content": str | None, "finish_reason": str | None}.
        """
        provider_name = provider or settings.routing.default_provider

        if provider_name not in self.providers:
            available = sorted(self.providers.keys())
            raise RuntimeError(
                f"Provider '{provider_name}' not available. "
                f"Available: {available or 'NONE - check your API keys in .env'}"
            )

        return self.providers[provider_name].generate_stream(
            prompt=prompt,
            model=model,
            system_prompt=system_prompt,
            **kwargs,
        )

    async def worker(self, prompt: str, **kwargs: Any) -> dict[str, Any]:
        """
        Helper: gọi model worker (nhanh) cho task phụ.

        Ưu tiên localhost (nhanh), fallback NVIDIA.
        """
        if "localhost" in self.providers:
            return await self.generate(prompt=prompt, provider="localhost", **kwargs)
        if "nvidia" in self.providers:
            return await self.generate(prompt=prompt, provider="nvidia", **kwargs)
        raise RuntimeError("No AI provider available for worker tasks")


# Singleton instance - dùng chung toàn project
ai_gateway = AIGateway()