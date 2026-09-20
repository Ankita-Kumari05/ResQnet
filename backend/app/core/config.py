"""
ResQnet Core Configuration
Centralized settings management using pydantic-settings.
"""
from typing import List
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "ResQnet"
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api/v1"

    DATABASE_URL: str = "postgresql+asyncpg://resqnet:resqnet@localhost:5432/resqnet"
    SYNC_DATABASE_URL: str = "postgresql+psycopg2://resqnet:resqnet@localhost:5432/resqnet"

    SECRET_KEY: str = "resqnet-super-secret-key-change-in-production-2026"
    JWT_SECRET_KEY: str = "resqnet-super-secret-key-change-in-production-2026"
    JWT_ALGORITHM: str = "HS256"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080

    ENVIRONMENT: str = "development"
    FRONTEND_URL: str = "http://localhost:5173"
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:4173", "http://localhost:5174"]

    # Spatial + Temporal Incident Clustering Configuration (Step 6.4)
    CLUSTERING_RADIUS_METERS: float = 500.0  # Search radius in meters for incident proximity
    CLUSTERING_TEMPORAL_WINDOW_MINUTES: int = 120  # Time window in minutes for temporal correlation

    class Config:
        env_file = ".env"
        extra = "allow"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
