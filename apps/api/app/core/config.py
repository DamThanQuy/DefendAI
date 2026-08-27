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
from pathlib import Path
from typing import Optional
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Project root directory (where the main .env lives)
# This file is at: apps/api/app/core/config.py
# Project root is: ../../../../ (5 levels up) for local, /app for Docker
import sys
_config_file = Path(__file__).resolve()
if "/app/" in str(_config_file):
    PROJECT_ROOT = Path("/app")
else:
    PROJECT_ROOT = _config_file.parents[4]
ENV_FILE = PROJECT_ROOT / ".env"

class NVIDIAConfig(BaseSettings):
    """Config cho NVIDIA NIM API (dùng cho model lớn)."""
    api_key: str = ""
    base_url: str = "https://integrate.api.nvidia.com/v1"
    model: str = "stepfun-ai/Step-3.7-Flash"
    
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore", env_prefix="NVIDIA_", env_file=ENV_FILE, env_file_encoding="utf-8")

class LocalConfig(BaseSettings):
    """Config cho local LLM (OpenAI-compatible, ví dụ LM Studio, Ollama)."""
    api_key: str = ""
    base_url: str = ""
    model: str = ""
    
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore", env_prefix="LOCAL_", env_file=ENV_FILE, env_file_encoding="utf-8")

class RoutingConfig(BaseSettings):
    """Routing rules giữa các provider."""
    default_provider: str = ""
    
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore", env_file=ENV_FILE, env_file_encoding="utf-8")

class GoogleEmbedConfig(BaseSettings):
    """Config cho Google Gemini Embedding (thay gateway 20128 cho RAG embed).

    Gọi REST trực tiếp generativelanguage.googleapis.com, không qua local router.
    Giữ dim=1024 để khớp vector(1024) pgvector (HNSW chỉ index <=2000 dim).
    """
    api_key: str = ""
    model: str = ""
    base_url: str = "https://generativelanguage.googleapis.com/v1beta/models"
    dim: int = 1024
    
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore", env_prefix="GOOGLE_EMBED_", env_file=ENV_FILE, env_file_encoding="utf-8")

class LocalGatewayConfig(BaseSettings):
    """Config cho Local Gateway (OpenAI-compatible, chạy tại localhost:20128).

    Dùng làm vision provider thay thế hoặc song song với Gemini.
    Đăng ký model có vision=true qua /v1/models trên gateway.
    """
    api_key: str = ""
    base_url: str = "http://localhost:20128"
    model: str = ""
    enabled: bool = False

    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore", env_prefix="LOCAL_GATEWAY_", env_file=ENV_FILE, env_file_encoding="utf-8")

class MinioConfig(BaseSettings):
    """Config cho MinIO / S3-compatible object storage."""
    endpoint: str = ""
    access_key_id: str = ""
    secret_access_key: str = ""
    bucket: str = ""
    region: str = "us-east-1"
    secure: bool = False
    
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore", env_prefix="MINIO_", env_file=ENV_FILE, env_file_encoding="utf-8")

class RAGConfig(BaseSettings):
    """Config cho RAG retrieval (R5) — đổi qua .env, không cần sửa code."""
    top_k: int = 8
    min_score: float = 0.3
    # R10: reference chunks (chuẩn) — query thứ 2, top_k/ngưỡng riêng
    ref_top_k: int = 4
    ref_min_score: float = 0.25
    # Hybrid Search (BM25 + Vector) - Phase 0 enhancement
    hybrid_enabled: bool = True
    bm25_weight: float = 0.5
    rrf_k: int = 60
    rrf_top_k: int = 10
    # Reranker (Cross-encoder) - Phase 0 enhancement
    reranker_enabled: bool = True
    reranker_provider: str = "cross-encoder"  # cross-encoder | api | mock
    reranker_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    reranker_device: str = "cpu"
    reranker_max_length: int = 512
    reranker_batch_size: int = 32
    reranker_use_api: bool = False
    reranker_api_url: str = ""
    
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore", env_prefix="RAG_", env_file=ENV_FILE, env_file_encoding="utf-8")

class Settings(BaseSettings):
    """Cấu hình chính của ứng dụng."""
    app_name: str = "AI Project Defense System API"
    version: str = "0.1.0"
    debug: bool = True

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/defense_db"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080
    refresh_token_expire_days: int = 7
    google_client_id: str = ""

    # Sub-configs - will be loaded in model_post_init
    nvidia: Optional[NVIDIAConfig] = None
    local: Optional[LocalConfig] = None
    routing: Optional[RoutingConfig] = None
    minio: Optional[MinioConfig] = None
    rag: Optional[RAGConfig] = None
    google_embed: Optional[GoogleEmbedConfig] = None

    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore", env_file=ENV_FILE, env_file_encoding="utf-8")

    def model_post_init(self, __context) -> None:
        """Load nested configs after main settings loaded."""
        self.nvidia = NVIDIAConfig()
        self.local = LocalConfig()
        self.routing = RoutingConfig()
        self.minio = MinioConfig()
        self.rag = RAGConfig()
        self.google_embed = GoogleEmbedConfig()

# Singleton instance
settings = Settings()