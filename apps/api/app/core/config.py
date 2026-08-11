"""
Configuration cho toàn bộ ứng dụng FastAPI.
Đọc từ biến môi trường (file .env hoặc system env).

Cấu trúc:
- Settings: cấu hình chung (app, database, auth)
- NVIDIAConfig: config cho NVIDIA NIM (model lớn)
- GoogleConfig: config cho Google AI Studio (model worker)
- MinioConfig: config cho MinIO / S3-compatible object storage
- RoutingConfig: routing giữa các provider
"""
import os
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict


class NVIDIAConfig(BaseModel):
    """Config cho NVIDIA NIM API (dùng cho model lớn)."""
    api_key: str = os.getenv("NVIDIA_API_KEY", "")
    base_url: str = os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
    model: str = os.getenv("NVIDIA_MODEL", "stepfun-ai/Step-3.7-Flash")


class LocalConfig(BaseModel):
    """Config cho local LLM (OpenAI-compatible, ví dụ LM Studio, Ollama)."""
    api_key: str = os.getenv("LOCAL_API_KEY", "sk-f3ac88abb90d894b-o4159v-470a9d6a")
    base_url: str = os.getenv("LOCAL_BASE_URL", "http://localhost:20128/v1")
    model: str = os.getenv("LOCAL_MODEL", "combo-3")


class RoutingConfig(BaseModel):
    """Routing rules giữa các provider."""
    default_provider: str = os.getenv("DEFAULT_PROVIDER", "localhost")


class GoogleEmbedConfig(BaseModel):
    """Config cho Google Gemini Embedding (thay gateway 20128 cho RAG embed).

    Gọi REST trực tiếp generativelanguage.googleapis.com, không qua local router.
    Giữ dim=1024 để khớp vector(1024) pgvector (HNSW chỉ index <=2000 dim).
    """
    api_key: str = os.getenv("GOOGLE_EMBED_API_KEY", "AIzaSyD5vJeRXwcx5xuqDtEjUCIfNx80Cq6vkgI")
    model: str = os.getenv("GOOGLE_EMBED_MODEL", "gemini-embedding-001")
    base_url: str = os.getenv(
        "GOOGLE_EMBED_BASE_URL",
        "https://generativelanguage.googleapis.com/v1beta/models",
    )
    dim: int = int(os.getenv("GOOGLE_EMBED_DIM", "1024"))


class MinioConfig(BaseModel):
    """Config cho MinIO / S3-compatible object storage."""
    endpoint: str = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
    access_key_id: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    secret_access_key: str = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    bucket: str = os.getenv("MINIO_BUCKET", "defend-files")
    region: str = os.getenv("MINIO_REGION", "us-east-1")
    secure: bool = os.getenv("MINIO_SECURE", "false").lower() == "true"


class RAGConfig(BaseModel):
    """Config cho RAG retrieval (R5) — đổi qua .env, không cần sửa code."""
    top_k: int = int(os.getenv("RAG_TOP_K", "8"))
    min_score: float = float(os.getenv("RAG_MIN_SCORE", "0.3"))
    # R10: reference chunks (chuẩn) — query thứ 2, top_k/ngưỡng riêng
    ref_top_k: int = int(os.getenv("RAG_REF_TOP_K", "4"))
    ref_min_score: float = float(os.getenv("RAG_REF_MIN_SCORE", "0.25"))


class Settings(BaseSettings):
    """Cấu hình chính của ứng dụng."""
    app_name: str = "AI Project Defense System API"
    version: str = "0.1.0"
    debug: bool = True

    # Database
    database_url: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/defense_db")

    # Redis
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # Auth
    secret_key: str = os.getenv("SECRET_KEY", "change-me-in-production")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))
    refresh_token_expire_days: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")

    # Sub-configs
    nvidia: NVIDIAConfig = NVIDIAConfig()
    local: LocalConfig = LocalConfig()
    routing: RoutingConfig = RoutingConfig()
    minio: MinioConfig = MinioConfig()
    rag: RAGConfig = RAGConfig()
    google_embed: GoogleEmbedConfig = GoogleEmbedConfig()

    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")


# Singleton instance
settings = Settings()