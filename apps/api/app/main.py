"""
Entry point cho FastAPI backend.
Đây là file khởi động chính của API server.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
# Import routers (mỗi module đăng ký 1 router)
from app.routers import ai as ai_router
from app.routers import documents as documents_router
from app.routers import questions as questions_router
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
    allow_origins=["http://localhost:3000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== Register routers =====
# AI Gateway endpoints (test, compare, list providers/models)
app.include_router(ai_router.router)
# Document upload endpoints (upload, get, list)
app.include_router(documents_router.router)
# Question generation endpoints (generate, get assessment)
app.include_router(questions_router.router)

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
    Health check endpoint để kiểm tra server có đang chạy không.
    """
    return {
        "status": "healthy",
        "ai_providers": list(ai_gateway.providers.keys()),
        "ai_ready": len(ai_gateway.providers) > 0,
    }

from app.schemas.critique import CodeCritiqueRequest, CodeCritiqueResponse
from app.services.ai_service import analyze_code_with_ai

@app.post("/api/ai/critique-code", response_model=CodeCritiqueResponse)
async def critique_code(request: CodeCritiqueRequest):
    """
    Nhận Source Code và cấu trúc AST, sau đó gửi cho AI để nhận xét phản biện.
    """
    critique_text = await analyze_code_with_ai(request)
    return CodeCritiqueResponse(critique=critique_text)
