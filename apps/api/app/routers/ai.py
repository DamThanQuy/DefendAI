"""
Router cho AI Gateway - các endpoint test và so sánh.

Endpoints (GĐ1):
- POST /api/ai/test         Gọi 1 model bất kỳ
- GET  /api/ai/providers    List providers đang enabled
- GET  /api/ai/models       List model gợi ý
- POST /api/ai/compare      Gọi cả 2 provider, so sánh tốc độ
- POST /api/ai/orchestrate  Gọi model lớn (orchestrator) - shortcut
- POST /api/ai/worker       Gọi model worker - shortcut

⚠️ Đây là endpoint test/dev. Trong production sẽ dùng /api/questions/generate,
/api/code/scan thay thế.
"""
import asyncio
import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.schemas.ai import (
    AIRequest,
    AIResponse,
    AICompareRequest,
    AICompareResponse,
    AICompareItem,
)
from app.services.ai_client import ai_gateway


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["AI Gateway"])


# ============================================================
# GET /api/ai/providers
# ============================================================
@router.get(
    "/providers",
    summary="List AI providers đang enabled",
    description="Trả về thông tin các provider có API key hợp lệ + model mặc định",
)
async def list_providers() -> dict:
    """
    Kiểm tra xem provider nào đã được cấu hình đúng.
    Useful để verify .env đã load chưa.
    """
    providers = ai_gateway.list_providers()
    return {
        "enabled_count": len(providers),
        "providers": providers,
        "default_provider": settings.routing.default_provider,
        "orchestrator_provider": settings.routing.orchestrator_provider,
        "routing_config": {
            "default": settings.routing.default_provider,
            "orchestrator": settings.routing.orchestrator_provider,
        },
    }


# ============================================================
# GET /api/ai/models
# ============================================================
@router.get(
    "/models",
    summary="List models gợi ý cho mỗi provider",
    description="Danh sách model ID có thể dùng với mỗi provider (theo docs)",
)
async def list_models() -> dict:
    """Trả về danh sách model khả dụng cho mỗi provider."""
    return ai_gateway.list_all_models()


# ============================================================
# POST /api/ai/test
# ============================================================
@router.post(
    "/test",
    response_model=AIResponse,
    summary="Gọi 1 model bất kỳ để test",
    description="""
Gọi 1 provider cụ thể (nvidia hoặc google) với prompt tùy ý.

Ví dụ:
```json
{
  "prompt": "Giải thích AI trong 3 câu",
  "provider": "google",
  "model": "gemma-4-31b-it",
  "temperature": 0.2,
  "max_tokens": 200
}
```
""",
)
async def test_ai(req: AIRequest) -> AIResponse:
    """
    Gọi model và trả về response.
    Đây là endpoint chính để test 2 provider.
    """
    try:
        result = await ai_gateway.generate(
            prompt=req.prompt,
            provider=req.provider,
            model=req.model,
            system_prompt=req.system_prompt or "",
            temperature=req.temperature,
            max_tokens=req.max_tokens,
            reasoning_effort=req.reasoning_effort,
            response_format_json=req.response_format_json,
        )
        return AIResponse(**result)
    except RuntimeError as e:
        # Provider chưa config
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        # Prompt rỗng hoặc param sai
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("AI test failed")
        raise HTTPException(status_code=500, detail=f"AI call failed: {type(e).__name__}: {e}")


# ============================================================
# POST /api/ai/orchestrate (shortcut cho model lớn)
# ============================================================
@router.post(
    "/orchestrate",
    response_model=AIResponse,
    summary="Gọi model lớn (orchestrator) - NVIDIA Step 3.7 Flash",
    description="Shortcut cho việc gọi model phức tạp (reasoning, planning, generation)",
)
async def orchestrate(req: AIRequest) -> AIResponse:
    """Gọi model lớn qua helper `ai_gateway.orchestrate()`."""
    try:
        result = await ai_gateway.orchestrate(
            prompt=req.prompt,
            system_prompt=req.system_prompt or "",
            temperature=req.temperature,
            max_tokens=req.max_tokens,
            reasoning_effort=req.reasoning_effort,
        )
        return AIResponse(**result)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Orchestrate failed")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# POST /api/ai/worker (shortcut cho model nhỏ)
# ============================================================
@router.post(
    "/worker",
    response_model=AIResponse,
    summary="Gọi model worker (nhanh) - Google Gemma 4 31B IT",
    description="Shortcut cho việc gọi task nhanh (parse, classify, extract)",
)
async def worker(req: AIRequest) -> AIResponse:
    """Gọi model worker qua helper `ai_gateway.worker()`."""
    try:
        result = await ai_gateway.worker(
            prompt=req.prompt,
            system_prompt=req.system_prompt or "",
            temperature=req.temperature,
            max_tokens=req.max_tokens,
        )
        return AIResponse(**result)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Worker failed")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# POST /api/ai/compare
# ============================================================
@router.post(
    "/compare",
    response_model=AICompareResponse,
    summary="So sánh 2 provider cùng 1 prompt",
    description="""
Gọi cùng 1 prompt trên TẤT CẢ provider đang enabled.
Trả về kết quả + so sánh tốc độ (provider nào nhanh hơn, gấp bao nhiêu).

Hữu ích để benchmark thực tế giữa NVIDIA vs Google.
""",
)
async def compare_ai(req: AICompareRequest) -> AICompareResponse:
    """
    Gọi song song cả 2 provider (asyncio.gather) để so sánh.
    Nếu 1 provider lỗi → trả về error trong kết quả, không fail cả request.
    """
    available_providers = list(ai_gateway.providers.keys())
    if not available_providers:
        raise HTTPException(
            status_code=503,
            detail="No AI provider configured. Set NVIDIA_API_KEY and/or GOOGLE_API_KEY in .env",
        )

    async def call_provider(name: str) -> AICompareItem:
        """Gọi 1 provider, bắt lỗi trả về error trong item."""
        try:
            result = await ai_gateway.generate(
                prompt=req.prompt,
                provider=name,
                system_prompt=req.system_prompt or "",
                temperature=req.temperature,
                max_tokens=req.max_tokens,
            )
            return AICompareItem(
                provider=result["provider"],
                model=result["model"],
                content=result["content"],
                latency_ms=result["latency_ms"],
                usage=result["usage"],
                error=None,
            )
        except Exception as e:
            logger.warning("Compare [%s] failed: %s", name, e)
            return AICompareItem(
                provider=name,
                model="unknown",
                content="",
                latency_ms=0.0,
                usage={},
                error=f"{type(e).__name__}: {e}",
            )

    # Chạy song song tất cả provider
    results = await asyncio.gather(*[call_provider(n) for n in available_providers])

    # Tìm provider nhanh nhất (chỉ tính các item không lỗi)
    success_items = [r for r in results if r.error is None]
    faster = None
    speedup = None
    if len(success_items) >= 2:
        sorted_by_speed = sorted(success_items, key=lambda x: x.latency_ms)
        faster = sorted_by_speed[0].provider
        slowest_ms = sorted_by_speed[-1].latency_ms
        if sorted_by_speed[0].latency_ms > 0:
            speedup = round(slowest_ms / sorted_by_speed[0].latency_ms, 2)

    return AICompareResponse(
        results=list(results),
        faster_provider=faster,
        speedup=speedup,
    )