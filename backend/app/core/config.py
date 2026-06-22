"""
Configuración global de la aplicación BUSTOKE.

Centraliza las variables de entorno cargadas desde un archivo `.env`
utilizando pydantic-settings. Cualquier módulo que requiera acceso a
configuración debe importar la instancia `settings` definida aquí.
"""

from functools import lru_cache
from typing import List

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Variables de entorno validadas para todo el backend."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---------- Aplicación ----------
    APP_NAME: str = "BUSTOKE API"
    APP_VERSION: str = "1.0.0"
    APP_ENV: str = "development"
    APP_DEBUG: bool = True
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000

    # ---------- Base de Datos ----------
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "bustoke_db"
    DB_USER: str = "postgres"
    DB_PASSWORD: str = "postgres"
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30
    DB_ECHO_SQL: bool = False

    # ---------- Seguridad / JWT ----------
    SECRET_KEY: str = "change_me_in_production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    JWT_API_KEY_EXPIRE_DAYS: int = 365

    # ---------- CORS ----------
    # FIX BUG-010/XBUG-028: por default permitimos los 3 puertos
    # comunes del frontend dev (3000 = CRA, 5173 = Vite, 4173 = Vite preview).
    CORS_ORIGINS: List[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://localhost:4173",
        ]
    )

    # ---------- Negocio ----------
    SEAT_HOLD_TTL_SECONDS: int = 600

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_cors(cls, value):
        """Permite definir CORS_ORIGINS como string separado por comas."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def _validate_production_secrets(self):
        """
        FIX BUG-003: bloquea el arranque si en producción se usan los
        valores por defecto inseguros de `SECRET_KEY` o `DB_PASSWORD`.
        """
        if self.APP_ENV == "production":
            if self.SECRET_KEY == "change_me_in_production":
                raise ValueError(
                    "SECRET_KEY debe configurarse en producción "
                    "(APP_ENV=production). Define un valor seguro en .env."
                )
            if self.DB_PASSWORD == "postgres":
                raise ValueError(
                    "DB_PASSWORD debe configurarse en producción "
                    "(APP_ENV=production). No uses el default inseguro."
                )
        return self

    @property
    def database_url(self) -> str:
        """Compone la URL de conexión para SQLAlchemy (driver psycopg2)."""
        return (
            f"postgresql+psycopg2://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Retorna una instancia única (cacheada) de la configuración."""
    return Settings()


settings: Settings = get_settings()
