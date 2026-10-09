"""Tiện ích SSE: giữ kết nối sống trong lúc chờ LLM sinh token đầu tiên.

Vấn đề production 2026-10-09: reasoning model (step-3.7-flash...) có thể im lặng
>30s trước khi emit content token đầu tiên. FE có watchdog "30s không nhận dữ
liệu → abort" nên user thấy 'Hết thời gian chờ phản hồi từ AI' dù backend vẫn
đang chạy. Giải pháp: wrap async iterator của gateway bằng heartbeat — cứ mỗi
`seconds` giây không có chunk mới thì yield sentinel HEARTBEAT để caller gửi
frame `status` giữ kết nối (mọi byte tới FE đều reset watchdog).
"""
from __future__ import annotations

import asyncio
from typing import AsyncIterator, Any

# Sentinel riêng biệt (identity check) — không lẫn được với chunk dict của gateway
HEARTBEAT = object()


async def heartbeat_stream(
    source: AsyncIterator[Any],
    seconds: float = 10.0,
) -> AsyncIterator[Any]:
    """Yield lại từng chunk của `source`; xen kẽ HEARTBEAT khi source im lặng.

    - Source hết → dừng iterator (không yield HEARTBEAT thừa).
    - Source raise → exception lan truyền bình thường (caller xử lý).
    """
    it = source.__aiter__()
    while True:
        try:
            chunk = await asyncio.wait_for(it.__anext__(), timeout=seconds)
        except StopAsyncIteration:
            return
        except asyncio.TimeoutError:
            yield HEARTBEAT
            continue
        yield chunk
