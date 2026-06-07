"""
Configuration cho toàn bộ ứng dụng FastAPI.
Đọc từ biến môi trường (file .env hoặc system env).

Cấu trúc:
- Settings: cấu hình chung (app, database, auth)
- NVIDIAConfig: config cho NVIDIA NIM (model lớn)
- GoogleConfig: config cho Google AI Studio (model worker)
- RoutingConfig: routing giữa các provider
"""
import os
from pydantic_settings import BaseSettings


class NVIDIAConfig(BaseSettings):
    """
    Config cho NVIDIA NIM API (dùng cho model lớn - Step-3.7-Flash).
    
    Env vars: NVIDIA_API_KEY, NVIDIA_BASE_URL, NVIDIA_MODEL
    Lấy key tại: https://build.nvidia.com
    """
    api_key: str = ""
    base_url: str = "https://integrate.api.nvidia.com/v1"
    model: str = "stepfun-ai/Step-3.7-Flash"
    
    class Config:
        env_prefix = "NVIDIA_"
        case_sensitive = False


class GoogleConfig(BaseSettings):
    """
    Config cho Google AI Studio (dùng cho model worker - Gemma 4 31B IT).
    
    Env vars: GOOGLE_API_KEY, GOOGLE_BASE_URL, GOOGLE_MODEL
    Lấy key tại: https://aistudio.google.com/app/apikey
    """
    api_key: str = ""
    base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    model: str = "gemma-4-31b-it"
    
    class Config:
        env_prefix = "GOOGLE_"
        case_sensitive = False


class RoutingConfig(BaseSettings):
    """
    Routing rules giữa các provider.
    
    Env vars: DEFAULT_PROVIDER, ORCHESTRATOR_PROVIDER
    """
    default_provider: str = "google"        # Provider mặc định cho task thường
    orchestrator_provider: str = "nvidia"   # Provider cho task phức tạp (model lớn)
    
    class Config:
        case_sensitive = False


class Settings(BaseSettings):
    """Cấu hình chính của ứng dụng."""
    # App info
    app_name: str = "AI Project Defense System API"
    version: str = "0.1.0"
    debug: bool = True
    
    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5433/defense_db"
    
    # Auth
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # AI Providers (nested config)
    nvidia: NVIDIAConfig = NVIDIAConfig()
    google: GoogleConfig = GoogleConfig()
    routing: RoutingConfig = RoutingConfig()
    
    class Config:
        env_file = ".env"
        case_sensitive = False
        # Cho phép ignore các env var không match với schema
        # (vd: DATABASE_URL, NVIDIA_API_KEY bị Settings nuốt khi load)
        extra = "ignore"


# Singleton instance - import từ đâu cũng dùng chung
settings = Settings()