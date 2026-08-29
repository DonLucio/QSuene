from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="PARTY_", extra="ignore")

    env: str = "development"
    secret_key: str = Field(
        default="development-secret-key-change-before-production",
        min_length=32,
    )
    public_url: str = "http://localhost:5174"
    allowed_origins: str = (
        "http://localhost:5174,http://localhost:8000,http://localhost:8080,"
        "http://localhost:5000,http://localhost:5001,http://localhost:5002,"
        "http://127.0.0.1:5000,http://127.0.0.1:5001,http://127.0.0.1:5002,"
        "http://127.0.0.1:5174,http://127.0.0.1:8000,http://127.0.0.1:8765"
    )
    redis_url: str | None = None
    database_url: str | None = None
    room_idle_minutes: int = 120
    disconnected_guest_minutes: int = 30
    dj_absence_seconds: int = Field(default=60, ge=30, le=600)

    @model_validator(mode="after")
    def validate_production(self):
        if self.env.lower() == "production":
            if self.secret_key == "development-secret-key-change-before-production":
                raise ValueError("PARTY_SECRET_KEY debe configurarse en producción")
            if not self.redis_url or not self.database_url:
                raise ValueError("PARTY_REDIS_URL y PARTY_DATABASE_URL son obligatorias en producción")
        return self

    @property
    def origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
