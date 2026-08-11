"""Handlers cho background job processing.

Mỗi handler đăng ký với job_queue.register_handler decorator.
Import tất cả để handler được đăng ký khi worker khởi động.
"""
from app.handlers.chat_ask import handle_chat_ask
from app.handlers.code_scan import handle_code_scan, handle_code_scan_module
from app.handlers.questions import handle_generate_questions
from app.handlers.reference_index import handle_reference_index
from app.handlers.workspace_questions import handle_workspace_questions

__all__ = [
    "handle_chat_ask",
    "handle_code_scan",
    "handle_code_scan_module",
    "handle_generate_questions",
    "handle_reference_index",
    "handle_workspace_questions",
]
