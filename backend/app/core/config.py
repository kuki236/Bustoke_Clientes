"""
Configuración global de la aplicación BUSTOKE.

Centraliza las variables de entorno cargadas desde un archivo `.env`
utilizando pydantic-settings. Cualquier módulo que requiera acceso a
configuración debe importar la instancia `settings` definida aquí.
"""

import math
from functools import lru_cache
from typing import Annotated, List

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


# ============================================================================
# ============================================================================
# NIST SP 800-117 recomienda ≥ 128 bits para HMAC-SHA256. Usamos 256 bits
# como margen para protegernos contra ataques de diccionario sobre
# secretos aparentemente "largos" pero de baja entropía (ej:
# "bustoke_clave_secreta_26262626" mide 32 chars pero tiene ~120 bits).
MIN_SECRET_KEY_BITS = 256


def _shannon_entropy_bits(value: str) -> float:
    """
    Calcula la entropía de Shannon total (en bits) de un string.

    Útil como heurística para detectar secretos débiles (palabras de
    diccionario, fechas, RUCs, etc.) que aunque midan 30+ caracteres
    tienen muy poca entropía real.

    Fórmula: H = -Σ p(x) * log2(p(x)) * len(string)
    """
    if not value:
        return 0.0
    freq: dict[str, int] = {}
    for ch in value:
        freq[ch] = freq.get(ch, 0) + 1
    length = len(value)
    entropy = 0.0
    for count in freq.values():
        p = count / length
        entropy -= p * math.log2(p)
    return entropy * length


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
    # Si `DATABASE_URL` está definida (Neon, Render, Railway, Supabase, etc.),
    # tiene prioridad sobre los campos individuales DB_HOST/DB_NAME/...
    # Se espera en formato SQLAlchemy: postgresql+psycopg2://user:pass@host:port/db
    DATABASE_URL: str | None = None
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "bustoke_db"
    DB_USER: str = "postgres"
    DB_PASSWORD: str = "postgres"
    DB_SSLMODE: str | None = None
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

    # ---------- Rate Limiting (FIX A07) ----------
    # Por defecto habilitado. En pytest se desactiva automáticamente
    # para no romper los 87 tests (que comparten la misma IP "testclient").
    RATE_LIMIT_ENABLED: bool = True

    # ---------- CORS ----------
    CORS_ORIGINS: Annotated[List[str], NoDecode] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://localhost:4173",
            "https://bustoke-clientes.vercel.app",
        ]
    )

    # ---------- Negocio ----------
    SEAT_HOLD_TTL_SECONDS: int = 600
    # Job de limpieza de holds expirados. Se ejecuta cada
    # `HOLD_CLEANUP_INTERVAL_SECONDS` segundos en background dentro
    # del lifespan de la app. En tests se desactiva con
    # `HOLD_CLEANUP_DISABLED=true` para no interferir.
    HOLD_CLEANUP_INTERVAL_SECONDS: int = 300
    HOLD_CLEANUP_DISABLED: bool = False

    # ---------- Mercado Pago (Card Payment Brick) ----------
    # Credenciales sandbox por defecto. En producción se sobreescriben
    # vía variables de entorno. La cuenta está en Perú (PEN).
    MERCADOPAGO_PUBLIC_KEY: str | None = None
    MERCADOPAGO_ACCESS_TOKEN: str | None = None
    MERCADOPAGO_CURRENCY: str = "PEN"
    MERCADOPAGO_COUNTRY: str = "PE"

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
        FIX BUG-003 + FIX A02: endurece la validación de secretos en
        producción. Ahora no solo bloquea los defaults conocidos, sino
        que exige:

          1. SECRET_KEY no sea el default "change_me_in_production".
          2. DB_PASSWORD no sea el default "postgres".
          3. SECRET_KEY tenga al menos 32 caracteres (longitud mínima).
          4. SECRET_KEY tenga al menos 256 bits de entropía (FIX A02).

        El cálculo de entropía detecta secretos como
        "bustoke_clave_secreta_26262626" (32 chars pero ~120 bits)
        que pasarían la longitud pero son bruteforceables.

        Comando para generar uno seguro:
            python -c "import secrets; print(secrets.token_urlsafe(64))"
        """
        if self.APP_ENV == "production":
            # 1. Defaults conocidos
            if self.SECRET_KEY == "change_me_in_production":
                raise ValueError(
                    "SECRET_KEY debe configurarse en producción "
                    "(APP_ENV=production). Genera uno con: "
                    'python -c "import secrets; print(secrets.token_urlsafe(64))"'
                )
            if self.DB_PASSWORD == "postgres":
                raise ValueError(
                    "DB_PASSWORD debe configurarse en producción "
                    "(APP_ENV=production). No uses el default inseguro."
                )

            # 2. Longitud mínima
            if len(self.SECRET_KEY) < 32:
                raise ValueError(
                    f"SECRET_KEY demasiado corto ({len(self.SECRET_KEY)} chars). "
                    "Mínimo 32 caracteres en producción."
                )

            # 3. Entropía mínima (FIX A02: detecta secretos predecibles)
            entropy = _shannon_entropy_bits(self.SECRET_KEY)
            if entropy < MIN_SECRET_KEY_BITS:
                raise ValueError(
                    f"SECRET_KEY tiene entropía insuficiente "
                    f"({entropy:.1f} bits < {MIN_SECRET_KEY_BITS} bits). "
                    f"Probablemente es un secreto predecible. Genera uno "
                    f"aleatorio con: "
                    f'python -c "import secrets; print(secrets.token_urlsafe(64))"'
                )
        return self

    @property
    def database_url(self) -> str:
        """
        Compone la URL de conexión para SQLAlchemy (driver psycopg2).

        Si `DATABASE_URL` está definida en el entorno, se devuelve tal cual
        (útil para Neon/Render/Railway). Si no, se construye a partir de los
        campos individuales DB_HOST/DB_NAME/...
        """
        if self.DATABASE_URL:
            url = self.DATABASE_URL.strip()
            if not url.startswith("postgresql+psycopg2://") and not url.startswith("postgresql://"):
                raise ValueError(
                    "DATABASE_URL debe usar el driver 'postgresql+psycopg2://' "
                    "(o 'postgresql://'). El backend usa SQLAlchemy síncrono."
                )
            return url
        return (
            f"postgresql+psycopg2://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    @property
    def secret_key_source(self) -> str:
        """
        FIX A02: indica si el SECRET_KEY es seguro o no.
        Útil para health check y dashboards de observabilidad.
        """
        if self.SECRET_KEY == "change_me_in_production":
            return "default-insecure"
        entropy = _shannon_entropy_bits(self.SECRET_KEY)
        if entropy < MIN_SECRET_KEY_BITS:
            return "low-entropy"
        return "ok"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Retorna una instancia única (cacheada) de la configuración."""
    return Settings()


settings: Settings = get_settings()
