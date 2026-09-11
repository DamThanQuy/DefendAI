"""Background worker entrypoint.

Chạy worker loop: lấy job từ Redis queue, xử lý, ghi kết quả.
Usage: python worker_main.py
"""
from __future__ import annotations

import asyncio
import logging
import os
import signal
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Import handlers để đăng ký trước khi worker loop chạy
# noqa: F401 — imported for side-effect (handler registration)
from app.handlers import (  # noqa: F401
    handle_code_scan,
    handle_code_scan_module,
    handle_generate_questions,
)
from app.services.job_queue import worker_loop

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

HEALTH_PORT = int(os.getenv("WORKER_HEALTH_PORT", "9091"))


class _HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        if self.path in ("/health", "/"):
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"ok")
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args) -> None:  # silence default stderr logging
        pass


def _run_health_server() -> None:
    server = ThreadingHTTPServer(("0.0.0.0", HEALTH_PORT), _HealthHandler)
    server.serve_forever()


async def main() -> None:
    # Health server cho docker healthcheck (port 9091, trùng worker_multi)
    threading.Thread(target=_run_health_server, daemon=True).start()

    logger.info("DefendAI Worker starting...")
    await worker_loop()


def _terminate(*_args) -> None:
    raise SystemExit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, _terminate)
    signal.signal(signal.SIGTERM, _terminate)
    try:
        asyncio.run(main())
    except SystemExit:
        logger.info("Worker stopped.")
