"""Application settings — environment-driven."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Core
    environment: str = "development"
    debug: bool = True

    # Database
    postgres_dsn: str = "postgresql+psycopg://legalise:legalise@db:5432/legalise"

    # Cache / queue
    redis_url: str = "redis://redis:6379/0"

    # Storage (MinIO / S3-compatible)
    s3_endpoint: str = "http://minio:9000"
    s3_access_key: str = "legalise"
    s3_secret_key: str = "legalisesecret"
    s3_bucket: str = "legalise-docs"
    s3_region: str = "eu-west-2"

    # Document conversion
    gotenberg_url: str = "http://gotenberg:3000"

    # AI providers
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    ollama_url: str = "http://ollama:11434"
    default_model_id: str = "claude-opus-4-7"

    # Auth (stub — v0.2 swaps for WorkOS/Stytch)
    session_secret: str = "change-me-in-deployment"

    # CORS
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    # Matter filesystem materialisation
    matters_root: str = "/data/matters"

    # claude-for-uk-legal plugin suite checkout. Bind-mounted into the
    # backend container in dev (see infra/docker-compose.yml).
    plugins_root: str = "/plugins"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
