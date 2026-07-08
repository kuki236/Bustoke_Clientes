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


# FIX A07: el limiter existe SIEMPRE, pero la aplicación de los
# límites se controla con `enabled` según el entorno.
#
# - En pytest, `TestClient` no setea una IP real → todas las requests
#   comparten la key 'testclient' y los límites bloquean los tests.
#   Por eso, los routers usan `if settings.RATE_LIMIT_ENABLED`
#   antes de aplicar el decorator (ver conftest.py).
#
# - En producción / staging, `RATE_LIMIT_ENABLED=true` (default).


def _is_rate_limit_enabled() -> bool:
    """
    Lee la variable de entorno en cada llamada (NO en import-time)
    para que los tests puedan desactivarla vía `os.environ` ANTES
    de que se importen los routers.
    """
    return os.getenv("RATE_LIMIT_ENABLED", "true").lower() != "false"


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


__all__ = ["limiter", "_is_rate_limit_enabled"]
