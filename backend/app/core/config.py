"""
ResQnet Core Configuration
Centralized settings management using pydantic-settings.
"""
from typing import List
from functools import lru_cache
from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "ResQnet"
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api/v1"

    DATABASE_URL: str = "postgresql+asyncpg://resqnet:resqnet@localhost:5432/resqnet"
    SYNC_DATABASE_URL: str = "postgresql+psycopg2://resqnet:resqnet@localhost:5432/resqnet"

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_async_db_url(cls, v: str) -> str:
        """
        Ensures the async SQLAlchemy URL uses the asyncpg driver.
        Handles provider conventions:
        - 'postgres://...' -> 'postgresql+asyncpg://...'
        - 'postgresql://...' -> 'postgresql+asyncpg://...'
        """
        if not v:
            return v
        url = str(v).strip()
        if url.startswith("postgres://"):
            url = "postgresql+asyncpg://" + url[len("postgres://"):]
        elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
            url = "postgresql+asyncpg://" + url[len("postgresql://"):]
        return url

    @field_validator("SYNC_DATABASE_URL", mode="before")
    @classmethod
    def assemble_sync_db_url(cls, v: str) -> str:
        """
        Ensures the synchronous SQLAlchemy URL uses psycopg2.
        """
        if not v:
            return v
        url = str(v).strip()
        if url.startswith("postgres://"):
            url = "postgresql+psycopg2://" + url[len("postgres://"):]
        elif url.startswith("postgresql://") and not url.startswith("postgresql+psycopg2://"):
            url = "postgresql+psycopg2://" + url[len("postgresql://"):]
        return url

    SECRET_KEY: str = "resqnet-super-secret-key-change-in-production-2026"
    JWT_SECRET_KEY: str = "resqnet-super-secret-key-change-in-production-2026"
    JWT_ALGORITHM: str = "HS256"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080

    ENVIRONMENT: str = "development"
    FRONTEND_URL: str = "http://localhost:5173"
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:4173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]
    CORS_ORIGIN_REGEX: str = r"^https?:\/\/.*\.vercel\.app$"

    # Spatial + Temporal Incident Clustering Configuration (Step 6.4)
    CLUSTERING_RADIUS_METERS: float = 500.0  # Search radius in meters for incident proximity
    CLUSTERING_TEMPORAL_WINDOW_MINUTES: int = 120  # Time window in minutes for temporal correlation

    # SMS Fallback Gateway Configuration
    COORDINATOR_SMS_RECIPIENT_NUMBER: str = "+919814189021"

    class Config:
        env_file = ".env"
        extra = "allow"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
