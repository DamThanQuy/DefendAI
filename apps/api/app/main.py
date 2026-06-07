"""
Entry point cho FastAPI backend.
Đây là file khởi động chính của API server.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
# Import routers (mỗi module đăng ký 1 router)
from app.routers import ai as ai_router
# Khởi tạo AI gateway ngay khi import (sẽ log providers nào đã ready)
from app.services.ai_client import ai_gateway

app = FastAPI(
    title=settings.app_name,
    description="Backend API cho hệ thống hỗ trợ bảo vệ đồ án bằng AI",
    version=settings.version,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== Register routers =====
# AI Gateway endpoints (test, compare, list providers/models)
app.include_router(ai_router.router)


@app.get("/")
async def root():
    return {
        "message": settings.app_name,
        "version": settings.version,
        "status": "running",
    }


@app.get("/health")
async def health_check():
    """
    Health check endpoint để kiểm tra server có đang chạy không.
    """
    # Trả về thêm thông tin AI providers để debug
    return {
        "status": "healthy",
        "ai_providers": list(ai_gateway.providers.keys()),
        "ai_ready": len(ai_gateway.providers) > 0,
    }
