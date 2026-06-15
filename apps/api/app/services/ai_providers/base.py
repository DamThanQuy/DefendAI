"""
Base class cho OpenAI-compatible LLM API provider.

Cả NVIDIA NIM và Google AI Studio đều dùng OpenAI API spec:
- Endpoint: POST /chat/completions
- Auth: Authorization: Bearer <api_key>
- Body: { model, messages, temperature, ... }

→ Class này cung cấp logic chung, các provider con chỉ cần override `get_default_model()`.
"""
import time
import logging
from abc import ABC, abstractmethod
from typing import Any

import httpx


logger = logging.getLogger(__name__)


class OpenAICompatibleProvider(ABC):
    """
    Abstract base class cho mọi OpenAI-compatible provider.

    Implement:
    - NVIDIAProvider: integrate.api.nvidia.com
    - GoogleProvider: generativelanguage.googleapis.com/v1beta/openai
    - OpenAIProvider: api.openai.com (giai đoạn sau)

    Methods cần implement:
    - get_default_model(): trả về model mặc định của provider

    Methods có sẵn:
    - generate(): gọi chat completions API
    """

    def __init__(self, api_key: str, base_url: str, provider_name: str) -> None:
        """
        Khởi tạo provider.

        Args:
            api_key: API key để xác thực
            base_url: Base URL của API (không bao gồm /chat/completions)
            provider_name: Tên định danh (nvidia, google, openai, ...)
        """
        if not api_key:
            raise ValueError(f"{provider_name}: API key is required")
        if not base_url:
            raise ValueError(f"{provider_name}: base_url is required")

        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.provider_name = provider_name

    @abstractmethod
    def get_default_model(self) -> str:
        """
        Trả về model ID mặc định của provider.
        Ví dụ: "stepfun-ai/Step-3.7-Flash", "gemma-4-31b-it"
        """
        ...

    def _build_headers(self) -> dict[str, str]:
        """
        Build HTTP headers cho request.
        Cả NVIDIA và Google đều dùng Bearer token.
        """
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def generate(
        self,
        *,
        prompt: str,
        model: str | None = None,
        system_prompt: str = "",
        temperature: float = 0.2,
        max_tokens: int | None = None,
        reasoning_effort: str | None = None,
        response_format_json: bool = False,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """
        Gọi chat completions API.

        Args:
            prompt: User prompt
            model: Model ID (mặc định: provider's default)
            system_prompt: System instruction
            temperature: Sampling temperature (0.0 - 2.0)
            max_tokens: Giới hạn output tokens
            reasoning_effort: low | medium | high (chỉ NVIDIA Step 3.7 hỗ trợ)
            response_format_json: Nếu True, ép model trả về JSON object
            **kwargs: Extra params gửi kèm (top_p, frequency_penalty, ...)

        Returns:
            Dict với keys:
            - provider: tên provider
            - model: model ID đã dùng
            - content: nội dung text từ model
            - usage: {prompt_tokens, completion_tokens, total_tokens}
            - latency_ms: thời gian xử lý (ms)
            - raw: response gốc từ API
        """
        # Validate
        if not prompt or not prompt.strip():
            raise ValueError("prompt is required and cannot be empty")

        model = model or self.get_default_model()
        url = f"{self.base_url}/chat/completions"
        headers = self._build_headers()

        # Build messages
        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        # Build payload
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "stream": False,
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens
        if reasoning_effort:
            # OpenAI-compatible: NVIDIA Step 3.7 hỗ trợ reasoning_effort
            payload["reasoning_effort"] = reasoning_effort
        if response_format_json:
            payload["response_format"] = {"type": "json_object"}

        # Merge extra params (top_p, frequency_penalty, ...)
        for key, value in kwargs.items():
            if value is not None:
                payload[key] = value

        # Call API
        start = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as e:
            logger.error(
                "[%s] HTTP %s: %s",
                self.provider_name,
                e.response.status_code,
                e.response.text[:500],
            )
            raise
        except Exception as e:
            logger.error("[%s] Request failed: %s", self.provider_name, e)
            raise

        latency_ms = (time.perf_counter() - start) * 1000

        # Parse response
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as e:
            logger.error("[%s] Unexpected response format: %s", self.provider_name, e)
            raise ValueError(f"Invalid response from {self.provider_name}: {data}")

        usage = data.get("usage", {})

        return {
            "provider": self.provider_name,
            "model": model,
            "content": content,
            "usage": {
                "prompt_tokens": usage.get("prompt_tokens", 0),
                "completion_tokens": usage.get("completion_tokens", 0),
                "total_tokens": usage.get("total_tokens", 0),
            },
            "latency_ms": round(latency_ms, 2),
            "raw": data,
        }