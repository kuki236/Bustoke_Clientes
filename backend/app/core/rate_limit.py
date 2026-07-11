"""
Configuración centralizada de rate limiting (FIX A07).

`slowapi` se instancia UNA vez aquí y se importa desde `main.py`
y desde los routers que necesiten `@limiter.limit(...)`.

La razón de tener este módulo separado (en vez de instanciar en
main.py) es que el decorator `@limiter.limit(...)` se evalúa en
import-time, antes de que se cree la app. Por tanto, el limiter
debe existir como singleton a nivel de módulo.
"""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address


# Singleton del limiter. `key_func=get_remote_address` usa la IP
# del cliente (considera X-Forwarded-For si hay un proxy reverso).
limiter = Limiter(
    key_func=get_remote_address,
    # Default global: 60 req/min por IP. Se puede sobreescribir
    # por endpoint con `@limiter.limit("5/minute")`.
    default_limits=["60/minute"],
    # Storage en memoria (suficiente para una sola instancia).
    # Para múltiples réplicas, usar Redis: `storage_uri="redis://..."`.
    headers_enabled=True,  # Añade X-RateLimit-* headers a las respuestas
    strategy="fixed-window",  # Más rápido que "moving-window"
)


def _sync_enabled_from_env() -> None:
    """
    Sincroniza `limiter.enabled` con la variable de entorno
    `RATE_LIMIT_ENABLED`. Se ejecuta al import-time de este módulo
    (es decir, una vez por proceso de pytest / uvicorn).

    Los tests configuran `RATE_LIMIT_ENABLED=false` ANTES de
    importar la app (ver `tests/api/conftest.py:34`), por lo que al
    instanciarse `limiter`, `enabled` ya refleja el valor correcto.
    En producción queda en `True` (default de slowapi).
    """
    enabled = os.getenv("RATE_LIMIT_ENABLED", "true").lower() != "false"
    limiter.enabled = enabled


_sync_enabled_from_env()


__all__ = ["limiter"]
