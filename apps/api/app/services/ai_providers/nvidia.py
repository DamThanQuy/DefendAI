"""
NVIDIA NIM provider - wrapper cho NVIDIA integrate API.

Dùng cho model lớn (Step-3.7-Flash) - tasks phức tạp: reasoning, planning, generation.

Docs: https://docs.api.nvidia.com/nim/reference/stepfun-ai-step-3-7-flash
Auth: Authorization: Bearer $NVIDIA_API_KEY
Endpoint: https://integrate.api.nvidia.com/v1/chat/completions
"""
from app.core.config import settings
from app.services.ai_providers.base import OpenAICompatibleProvider


class NVIDIAProvider(OpenAICompatibleProvider):
    """
    Provider cho NVIDIA NIM API.

    Features hỗ trợ:
    - reasoning_effort: low | medium | high (Step 3.7 hỗ trợ 3 mức reasoning)
    - response_format: {type: json_object}
    - 256K context window
    - Vision input (multimodal) - chưa dùng trong GĐ1
    """

    def __init__(self) -> None:
        super().__init__(
            api_key=settings.nvidia.api_key,
            base_url=settings.nvidia.base_url,
            provider_name="nvidia",
        )

    def get_default_model(self) -> str:
        return settings.nvidia.model