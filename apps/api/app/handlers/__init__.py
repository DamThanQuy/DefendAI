"""Handlers cho background job processing.

Mỗi handler đăng ký với job_queue.register_handler decorator.
Import tất cả để handler được đăng ký khi worker khởi động.
"""
from app.handlers.code_scan import handle_code_scan
from app.handlers.questions import handle_generate_questions

__all__ = ["handle_code_scan", "handle_generate_questions"]
