"""
Simulation Engine Config
Loads settings from .env file.
Credentials are never hardcoded — loaded from environment only.
"""
import os
from functools import lru_cache

from pydantic_settings import BaseSettings


class SimSettings(BaseSettings):
    # ResQnet backend connection
    RESQNET_BASE_URL: str = "http://localhost:8000"

    # Simulation user credentials — loaded from .env, with seed defaults
    SIM_COORDINATOR_EMAIL: str = "coordinator@resqnet.in"
    SIM_COORDINATOR_PASSWORD: str = "coord123"
    SIM_CITIZEN_EMAIL: str = "citizen1@resqnet.in"
    SIM_CITIZEN_PASSWORD: str = "citizen123"

    # Simulation engine settings
    SIM_PORT: int = 9000
    SIM_DEFAULT_SPEED: int = 1
    SCENARIO_DIR: str = "./config"

    class Config:
        env_file = (
            os.path.join(os.path.dirname(__file__), "..", ".env"),
            ".env",
        )
        extra = "allow"


@lru_cache()
def get_sim_settings() -> SimSettings:
    return SimSettings()
