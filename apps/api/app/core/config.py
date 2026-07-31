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
    model: str = os.getenv("LOCAL_MODEL", "google")


class RoutingConfig(BaseModel):
    """Routing rules giữa các provider."""
    default_provider: str = os.getenv("DEFAULT_PROVIDER", "localhost")
    orchestrator_provider: str = os.getenv("ORCHESTRATOR_PROVIDER", "nvidia")


class MinioConfig(BaseModel):
    """Config cho MinIO / S3-compatible object storage."""
    endpoint: str = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
    access_key_id: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    secret_access_key: str = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    bucket: str = os.getenv("MINIO_BUCKET", "defend-files")
    region: str = os.getenv("MINIO_REGION", "us-east-1")
    secure: bool = os.getenv("MINIO_SECURE", "false").lower() == "true"


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
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")

    # Sub-configs
    nvidia: NVIDIAConfig = NVIDIAConfig()
    local: LocalConfig = LocalConfig()
    routing: RoutingConfig = RoutingConfig()
    minio: MinioConfig = MinioConfig()

    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")


# Singleton instance
settings = Settings()