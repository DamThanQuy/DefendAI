"""
Entry point cho FastAPI backend.
Đây là file khởi động chính của API server.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
# Import routers (mỗi module đăng ký 1 router)
from app.routers import ai as ai_router
from app.routers import code_scan as code_scan_router
from app.routers import documents as documents_router
from app.routers import questions as questions_router
from app.routers import meeting as meeting_router
# Khởi tạo AI gateway ngay khi import (sẽ log providers nào đã ready)
from app.services.ai_client import ai_gateway

app = FastAPI(
    title=settings.app_name,
    description="Backend API cho hệ thống hỗ trợ bảo vệ đồ án bằng AI",
    version=settings.version,
)

# Cấu hình CORS để frontend có thể gọi API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== Register routers =====
# AI Gateway endpoints (test, compare, list providers/models)
app.include_router(ai_router.router)
# Document upload endpoints (upload, get, list)
app.include_router(documents_router.router)
# Assessment endpoints (generate questions from uploaded documents)
app.include_router(questions_router.router)
# Code review endpoints (scan source code ZIP)
app.include_router(code_scan_router.router)
# Meeting / Chat endpoints
app.include_router(meeting_router.router)

@app.get("/")
async def root():
    return {
        "message": settings.app_name,
        "version": settings.version,
        "status": "running"
    }

@app.get("/health")
async def health_check():
    """
    Health check endpoint để kiểm tra server và AI status (Real-time).
    """
    import os

    # Kiểm tra trực tiếp RAM container xem Docker có truyền Key vào thật không
    google_env = os.getenv("GOOGLE_API_KEY")
    nvidia_env = os.getenv("NVIDIA_API_KEY")

    google_sys_ready = bool(google_env) and "PLACEHOLDER" not in google_env.upper()
    nvidia_sys_ready = bool(nvidia_env) and "PLACEHOLDER" not in nvidia_env.upper()

    # Nếu trong bộ nhớ RAM container CÓ KEY, nhưng gateway vẫn báo TRỐNG -> Tiến hành tự động nạp lại (Auto-Heal)
    if (google_sys_ready or nvidia_sys_ready) and not ai_gateway.providers:
        print("🔄 [Auto-Heal] Phát hiện có API Key hệ thống nhưng Gateway bị kẹt Singleton rỗng. Đang nạp lại...")
        ai_gateway._configure()  # Ép gateway chạy lại hàm quét môi trường

    return {
        "status": "healthy",
        "ai_providers": list(ai_gateway.providers.keys()),
        "ai_ready": len(ai_gateway.providers) > 0,
        "debug_env_detected": {
            "google": google_sys_ready,
            "nvidia": nvidia_sys_ready
        }
    }
