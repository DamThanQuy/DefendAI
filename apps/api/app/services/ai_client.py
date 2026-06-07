import json
import logging
from typing import Any

import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)


class AIProvider:
    async def generate(self, prompt: str, *, model: str | None = None, **kwargs: Any) -> dict:
        raise NotImplementedError


class OpenAIProvider(AIProvider):
    def __init__(self, api_key: str) -> None:
        self.api_key = api_key
        self.base_url = "https://api.openai.com/v1"

    async def generate(self, prompt: str, *, model: str = "gpt-4o", **kwargs: Any) -> dict:
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": kwargs.get("system_prompt", "")},
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": kwargs.get("temperature", 0.2),
        }
        if "max_tokens" in kwargs:
            payload["max_tokens"] = kwargs["max_tokens"]

        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

        content = data["choices"][0]["message"]["content"]
        return json.loads(content)


class GeminiProvider(AIProvider):
    def __init__(self, api_key: str) -> None:
        self.api_key = api_key
        self.base_url = (
            "https://generativelanguage.googleapis.com/v1beta/models"
        )

    async def generate(self, prompt: str, *, model: str = "gemini-1.5-pro", **kwargs: Any) -> dict:
        url = f"{self.base_url}/{model}:generateContent"
        params = {"key": self.api_key}

        system_prompt = kwargs.get("system_prompt") or ""
        combined_prompt = f"{system_prompt}\n\n{prompt}"
        payload = {
            "contents": [{"parts": [{"text": combined_prompt}]}],
            "generationConfig": {
                "temperature": kwargs.get("temperature", 0.2),
            },
        }
        if "max_tokens" in kwargs:
            payload["generationConfig"]["maxOutputTokens"] = kwargs["max_tokens"]

        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
            response = await client.post(url, params=params, json=payload)
            response.raise_for_status()
            data = response.json()

        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)


class AIGateway:
    def __init__(self) -> None:
        self.provider: AIProvider | None = None
        self._configure()

    def _configure(self) -> None:
        if settings.openai_api_key:
            self.provider = OpenAIProvider(api_key=settings.openai_api_key)
        elif settings.google_api_key:
            self.provider = GeminiProvider(api_key=settings.google_api_key)
        else:
            logger.warning("No AI API key configured")

    async def generate(self, prompt: str, **kwargs: Any) -> dict:
        if self.provider is None:
            raise RuntimeError("AI provider is not configured")
        return await self.provider.generate(prompt, **kwargs)


ai_gateway = AIGateway()
