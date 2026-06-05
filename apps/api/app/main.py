"""
Entry point cho FastAPI backend.
Đây là file khởi động chính của API server.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="AI Project Defense System API",
    description="Backend API cho hệ thống hỗ trợ bảo vệ đồ án bằng AI",
    version="0.1.0"
)

# Cấu hình CORS để frontend có thể gọi API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "message": "AI Project Defense System API",
        "version": "0.1.0",
        "status": "running"
    }

@app.get("/health")
async def health_check():
    """
    Health check endpoint để kiểm tra server có đang chạy không.
    """
    return {"status": "healthy"}