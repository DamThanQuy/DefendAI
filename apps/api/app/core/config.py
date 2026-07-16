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


class GoogleConfig(BaseModel):
    """Config cho Google AI Studio (dùng cho model worker)."""
    api_key: str = os.getenv("GOOGLE_API_KEY", "")
    base_url: str = os.getenv("GOOGLE_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai")
    model: str = os.getenv("GOOGLE_MODEL", "gemma-4-31b-it")


class RoutingConfig(BaseModel):
    """Routing rules giữa các provider."""
    default_provider: str = os.getenv("DEFAULT_PROVIDER", "google")
    orchestrator_provider: str = os.getenv("ORCHESTRATOR_PROVIDER", "nvidia")


class MinioConfig(BaseModel):
    """Config cho MinIO / S3-compatible object storage."""
    endpoint: str = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
    access_key_id: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    secret_access_key: str = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    bucket: str = os.getenv("MINIO_BUCKET", "defend-files")
    region: str = os.getenv("MINIO_REGION", "us-east-1")
    secure: bool = os.getenv("MINIO_SECURE", "false").lower() == "true"


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

    # Auth
    secret_key: str = os.getenv("SECRET_KEY", "change-me-in-production")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")

    # Sub-configs
    nvidia: NVIDIAConfig = NVIDIAConfig()
    google: GoogleConfig = GoogleConfig()
    routing: RoutingConfig = RoutingConfig()
    minio: MinioConfig = MinioConfig()

    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")


# Singleton instance
settings = Settings()