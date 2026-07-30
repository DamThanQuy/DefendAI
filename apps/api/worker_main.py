"""Background worker entrypoint.

Chạy worker loop: lấy job từ Redis queue, xử lý, ghi kết quả.
Usage: python worker_main.py
"""
from __future__ import annotations

import asyncio
import logging

# Import handlers để đăng ký trước khi worker loop chạy
# noqa: F401 — imported for side-effect (handler registration)
from app.handlers import (  # noqa: F401
    handle_code_scan,
    handle_generate_questions,
)
from app.services.job_queue import worker_loop

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def main() -> None:
    logger.info("DefendAI Worker starting...")
    await worker_loop()


if __name__ == "__main__":
    asyncio.run(main())
