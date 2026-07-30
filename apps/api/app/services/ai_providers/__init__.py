"""
AI Providers package.

Cung cấp abstraction cho nhiều LLM provider (NVIDIA NIM, Google AI Studio, ...).
Cả 2 provider hiện tại đều dùng OpenAI-compatible API → kế thừa từ OpenAICompatibleProvider.
"""
from app.services.ai_providers.base import OpenAICompatibleProvider
from app.services.ai_providers.nvidia import NVIDIAProvider
from app.services.ai_providers.local import LocalProvider

__all__ = [
    "OpenAICompatibleProvider",
    "NVIDIAProvider",
    "LocalProvider",
]