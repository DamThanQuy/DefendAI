"""
Entry point cho FastAPI backend.
Đây là file khởi động chính của API server.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

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
    return {"status": "healthy"}
