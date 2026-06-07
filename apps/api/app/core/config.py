import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "AI Project Defense System API"
    version: str = "0.1.0"
    debug: bool = True

    database_url: str = "postgresql://postgres:postgres@localhost:5432/defense_db"

    openai_api_key: str = ""
    google_api_key: str = ""

    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
