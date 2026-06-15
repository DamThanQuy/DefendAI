"""
Pydantic schemas cho AI test endpoints.

Endpoints:
- POST /api/ai/test       → AIRequest → AIResponse
- POST /api/ai/compare    → AICompareRequest → AICompareResponse
- GET  /api/ai/providers  → list providers
- GET  /api/ai/models     → list models
"""
from typing import Optional
from pydantic import BaseModel, Field


class AIRequest(BaseModel):
    """
    Request body cho POST /api/ai/test.

    Dùng để gọi 1 model bất kỳ (NVIDIA hoặc Google) với prompt tùy ý.
    """
    prompt: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="User prompt gửi đến model",
        examples=["Giải thích machine learning bằng tiếng Việt trong 3 câu"],
    )
    provider: Optional[str] = Field(
        None,
        description="Tên provider: 'nvidia' hoặc 'google'. Mặc định: settings.routing.default_provider",
        examples=["nvidia", "google"],
    )
    model: Optional[str] = Field(
        None,
        description="Model ID cụ thể. Mặc định: provider's default model",
        examples=[
            "stepfun-ai/Step-3.7-Flash",
            "gemma-4-31b-it",
            "gemma-4-26b-a4b-it",
        ],
    )
    system_prompt: Optional[str] = Field(
        "",
        max_length=5000,
        description="System instruction để hướng dẫn model",
    )
    temperature: float = Field(
        0.2,
        ge=0.0,
        le=2.0,
        description="Sampling temperature (0 = deterministic, 2 = creative)",
    )
    max_tokens: Optional[int] = Field(
        None,
        ge=1,
        le=32000,
        description="Giới hạn số tokens output",
    )
    reasoning_effort: Optional[str] = Field(
        None,
        description="Mức reasoning cho NVIDIA Step 3.7: 'low' | 'medium' | 'high'",
        examples=["low", "medium", "high"],
    )
    response_format_json: bool = Field(
        False,
        description="Nếu True, ép model trả về JSON object",
    )


class AIResponse(BaseModel):
    """
    Response body cho POST /api/ai/test.
    """
    provider: str = Field(..., description="Tên provider đã gọi")
    model: str = Field(..., description="Model ID đã dùng")
    content: str = Field(..., description="Nội dung text từ model")
    usage: dict = Field(..., description="Token usage: {prompt_tokens, completion_tokens, total_tokens}")
    latency_ms: float = Field(..., description="Thời gian xử lý (ms)")


class AICompareRequest(BaseModel):
    """
    Request body cho POST /api/ai/compare.

    Gọi cùng 1 prompt trên cả 2 provider để so sánh tốc độ + chất lượng.
    """
    prompt: str = Field(..., min_length=1, max_length=10000)
    system_prompt: Optional[str] = Field("", max_length=5000)
    temperature: float = Field(0.2, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(None, ge=1, le=8000)


class AICompareItem(BaseModel):
    """Một kết quả trong compare."""
    provider: str
    model: str
    content: str
    latency_ms: float
    usage: dict
    error: Optional[str] = None


class AICompareResponse(BaseModel):
    """
    Response body cho POST /api/ai/compare.
    Trả về kết quả của cả 2 provider (hoặc nhiều hơn nếu config).
    """
    results: list[AICompareItem] = Field(..., description="Kết quả từ các provider")
    faster_provider: Optional[str] = Field(
        None,
        description="Provider có latency thấp nhất (None nếu lỗi cả 2)",
    )
    speedup: Optional[float] = Field(
        None,
        description="Tỉ lệ nhanh hơn (vd: 2.5 = provider nhanh gấp 2.5 lần)",
    )