"""Multi-process code-review worker (Cách B).

Chạy N process worker độc lập, mỗi process BLPOP cùng 1 Redis queue. Các module
job (code_scan_module) được xử lý song song trên N process → scale bằng
`docker compose up -d --scale worker_multi=N`.

Usage: WORKER_PROCESSES=4 python worker_multi.py
"""
from __future__ import annotations

import asyncio
import logging
import multiprocessing
import os
import signal
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Import handlers để đăng ký (side-effect) trước khi worker loop chạy
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


def _run_worker() -> None:
    asyncio.run(worker_loop())


def main() -> None:
    threading.Thread(target=_run_health_server, daemon=True).start()

    n = int(os.getenv("WORKER_PROCESSES", "4"))
    logger.info("Starting %d code-review worker processes...", n)
    procs = [multiprocessing.Process(target=_run_worker, name=f"code-worker-{i}", daemon=True)
             for i in range(n)]
    for p in procs:
        p.start()

    def _terminate(*_args) -> None:
        for p in procs:
            p.terminate()
        raise SystemExit(0)

    signal.signal(signal.SIGINT, _terminate)
    signal.signal(signal.SIGTERM, _terminate)

    for p in procs:
        p.join()


if __name__ == "__main__":
    main()