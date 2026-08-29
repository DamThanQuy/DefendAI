"""
Entry point cho FastAPI backend.
Đây là file khởi động chính của API server.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from app.core.config import settings
# Import routers (mỗi module đăng ký 1 router)
from app.routers import ai as ai_router
from app.routers import admin as admin_router
from app.routers import admin_reference as admin_reference_router
from app.routers import auth as auth_router
from app.routers import code_scan as code_scan_router
from app.routers import documents as documents_router
from app.routers import questions as questions_router
from app.routers import meeting as meeting_router
from app.routers import bookings as bookings_router
from app.routers import availability as availability_router
from app.routers import jobs as jobs_router
from app.routers import workspaces as workspaces_router
from app.routers import workspace_chats as workspace_chats_router
from app.routers import workspace_questions as workspace_questions_router
from app.routers import workspace_messages as workspace_messages_router
from app.routers import rubrics as rubrics_router
from app.routers import mock_qa as mock_qa_router
from app.routers import signaling as signaling_router
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
# Admin endpoints (settings, chỉ admin)
app.include_router(admin_router.router)
# Admin: tài liệu chuẩn (R9) — upload/index reference_chunks
app.include_router(admin_reference_router.router)
# Auth endpoints (login, register)
app.include_router(auth_router.router)
# Document upload endpoints (upload, get, list)
app.include_router(documents_router.router)
# Assessment endpoints (generate questions from uploaded documents)
app.include_router(questions_router.router)
# Code review endpoints (scan source code ZIP)
app.include_router(code_scan_router.router)
# Meeting / Chat endpoints
app.include_router(meeting_router.router)
# Bookings (đặt lịch Mock Room: student -> mentor confirm)
app.include_router(bookings_router.router)
# Availability (lịch rảnh của mentor)
app.include_router(availability_router.router)
# Async Job Queue polling endpoints
app.include_router(jobs_router.router)
# Workspace endpoints (gom file theo đề tài)
app.include_router(workspaces_router.router)
# Workspace RAG questions ("Hỏi theo đề tài" — R6)
app.include_router(workspace_questions_router.router)
# Workspace RAG chat ("Chat đề tài" — R7)
app.include_router(workspace_chats_router.router)
# Workspace Messages (ChatGPT-style — R7 enhanced)
app.include_router(workspace_messages_router.router)
# Rubrics (tiêu chí chuẩn — thước đo AI)
app.include_router(rubrics_router.router)
# Mock Room AI Q&A WebSocket
app.include_router(mock_qa_router.router)
# WebRTC signaling (voice chat + screen share) cho Mock Room
app.include_router(signaling_router.router)

@app.on_event("startup")
async def _ensure_storage() -> None:
    """Tạo MinIO bucket nếu chưa tồn tại (idempotent)."""
    from app.services.storage import ensure_bucket
    try:
        await ensure_bucket()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("MinIO bucket init skipped: %s", exc)


@app.on_event("startup")
async def _load_ai_config_from_db() -> None:
    """Nạp AI provider/model từ DB (ai_providers / ai_models) sau khi khởi động.

    Env (LOCAL_*, NVIDIA_*) chỉ là fallback khi DB chưa có provider enabled.
    """
    import logging
    from app.services.ai_client import ai_gateway
    from app.core.database import async_session_maker
    try:
        async with async_session_maker() as db:
            await ai_gateway.reconfigure_from_db(db)
            logging.getLogger(__name__).info(
                "startup: AI gateway providers=%s models=%s",
                sorted(ai_gateway.providers.keys()),
                {k: v for k, v in ai_gateway.db_models.items()},
            )
    except Exception as exc:
        logging.getLogger(__name__).warning("startup: load AI config from DB skipped: %s", exc)


@app.get("/")
async def root():
    # Dev convenience: root → Swagger UI. ponytail: trên prod nên tắt (docs_url=None) hoặc trả info JSON thay vì redirect lộ API.
    return RedirectResponse(url="/docs")

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
        "ai_sources": {k: ai_gateway.provider_source.get(k, "unknown") for k in ai_gateway.providers},
        "debug_env_detected": {
            "google": google_sys_ready,
            "nvidia": nvidia_sys_ready
        }
    }
