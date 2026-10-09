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

_STOP = object()


async def _next_or_stop(it: AsyncIterator[Any]) -> Any:
    try:
        return await it.__anext__()
    except StopAsyncIteration:
        return _STOP


async def heartbeat_stream(
    source: AsyncIterator[Any],
    seconds: float = 10.0,
) -> AsyncIterator[Any]:
    """Yield lại từng chunk của `source`; xen kẽ HEARTBEAT khi source im lặng.

    - KHÔNG cancel `__anext__()` khi timeout (asyncio.wait_for sẽ hủy stream của
      gateway): dùng task + asyncio.wait để chờ tiếp đúng task đang treo.
    - Source hết → dừng iterator (không yield HEARTBEAT thừa).
    - Source raise → exception lan truyền bình thường (caller xử lý).
    """
    it = source.__aiter__()
    nxt: "asyncio.Task | None" = asyncio.ensure_future(_next_or_stop(it))
    try:
        while True:
            done, _ = await asyncio.wait({nxt}, timeout=seconds)
            if not done:
                yield HEARTBEAT
                continue
            chunk = nxt.result()
            if chunk is _STOP:
                return
            nxt = asyncio.ensure_future(_next_or_stop(it))
            yield chunk
    finally:
        if nxt is not None and not nxt.done():
            nxt.cancel()
