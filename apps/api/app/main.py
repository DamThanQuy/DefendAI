"""
Entry point cho FastAPI backend.
Đây là file khởi động chính của API server.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

<<<<<<< HEAD
=======
from app.core.config import settings
# Import routers (mỗi module đăng ký 1 router)
from app.routers import ai as ai_router
from app.routers import code_scan as code_scan_router
from app.routers import documents as documents_router
from app.routers import questions as questions_router
# Khởi tạo AI gateway ngay khi import (sẽ log providers nào đã ready)
from app.services.ai_client import ai_gateway

>>>>>>> 73a3644 ([FEAT]: Tich hop AI de scan file")
app = FastAPI(
    title="AI Project Defense System API",
    description="Backend API cho hệ thống hỗ trợ bảo vệ đồ án bằng AI",
    version="0.1.0"
)

# Cấu hình CORS để frontend có thể gọi API
app.add_middleware(
    CORSMiddleware,
<<<<<<< HEAD
    allow_origins=["http://localhost:3000"],  # Next.js dev server
=======
    allow_origins=["http://localhost:3000",
                   "http://127.0.0.1:3000"],
>>>>>>> 73a3644 ([FEAT]: Tich hop AI de scan file")
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

<<<<<<< HEAD
=======
# ===== Register routers =====
# AI Gateway endpoints (test, compare, list providers/models)
app.include_router(ai_router.router)
# Document upload endpoints (upload, get, list)
app.include_router(documents_router.router)
# Assessment endpoints (generate questions from uploaded documents)
app.include_router(questions_router.router)
# Code review endpoints (scan source code ZIP)
app.include_router(code_scan_router.router)


>>>>>>> 73a3644 ([FEAT]: Tich hop AI de scan file")
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
    Health check endpoint để kiểm tra server và AI status (Real-time).
    """
<<<<<<< HEAD
    return {"status": "healthy"}

from app.schemas.critique import CodeCritiqueRequest, CodeCritiqueResponse
from app.services.ai_service import analyze_code_with_ai

@app.post("/api/ai/critique-code", response_model=CodeCritiqueResponse)
async def critique_code(request: CodeCritiqueRequest):
    """
    Nhận Source Code và cấu trúc AST, sau đó gửi cho AI để nhận xét phản biện.
    """
    critique_text = await analyze_code_with_ai(request)
    return CodeCritiqueResponse(critique=critique_text)
=======
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
>>>>>>> 73a3644 ([FEAT]: Tich hop AI de scan file")
