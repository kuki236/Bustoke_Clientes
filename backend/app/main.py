"""
Punto de entrada principal de la API BUSTOKE.

- Crea la instancia de FastAPI con metadatos.
- Configura CORS leyendo orígenes permitidos desde `settings`.
- Registra el limiter de slowapi y el middleware de security headers.
- Incluye el router agregador (`app.api.router`).
- Define health check y un handler de validación genérico.
- Configura logging básico e inicializa servicios con side-effects
  (EmailService, etc.) en el lifespan event.
- Arranca el job de limpieza de holds expirados en background.
"""

import asyncio
import logging

from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

# Carga el .env en el process environment ANTES de cualquier import
# que lea env vars vía os.getenv(). pydantic-settings (en core.config)
# tiene su propio loader, pero email_service y otros módulos usan
# os.getenv() directamente y necesitan que las vars estén exportadas.
load_dotenv()

from app.api.router import api_router
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.rate_limit import limiter
from app.core.security_headers import SecurityHeadersMiddleware
from app.repositories.seat_repository import SeatRepository
from app.services.email_service import get_email_service

# Configuración de logging a nivel INFO para que los servicios
# (EmailService, booking, claims) emitan sus logs de diagnóstico.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
# Silenciar loggers muy verbosos de libs externas
for noisy in ("httpx", "httpcore", "watchfiles", "sqlalchemy.engine"):
    logging.getLogger(noisy).setLevel(logging.WARNING)

logger = logging.getLogger(__name__)


async def hold_cleanup_loop(stop_event: asyncio.Event) -> None:
    """
    Job en background que barre la tabla `bloqueos_temporales` y
    marca como `estado='expirado'` todos los holds con
    `expira_at <= NOW()`.

    Por defecto corre cada `HOLD_CLEANUP_INTERVAL_SECONDS` (300s =
    5 min) — suficiente para que un hold zombie típico (TTL=600s)
    quede en estado `expirado` al menos 5 min antes de lo que
    tardaría en `expira_at` por sí solo. Esto cubre cierres abruptos
    del navegador donde `releaseHoldsBeacon` nunca se envía.

    Implementación:
    - Usa una sesión SQLAlchemy independiente (no la de un request)
      para no interferir con el pool principal.
    - El driver psycopg2 es síncrono, así que despachamos la
      operación con `asyncio.to_thread` para no bloquear el loop.
    - Se cancela limpiamente cuando se setea `stop_event` (lo que
      hace el lifespan al cerrar la app).
    """
    interval = settings.HOLD_CLEANUP_INTERVAL_SECONDS
    logger.info(
        "[hold-cleanup] Iniciando job de limpieza de holds "
        "(intervalo=%ds)", interval
    )
    while not stop_event.is_set():
        try:
            cleaned = await asyncio.to_thread(_run_hold_cleanup_once)
            if cleaned:
                logger.info(
                    "[hold-cleanup] %d hold(s) marcados como expirado",
                    cleaned,
                )
        except Exception as exc:  # noqa: BLE001
            # Nunca debe tumbar la app: registramos y seguimos.
            logger.exception(
                "[hold-cleanup] Error en el job de limpieza: %s", exc
            )
        try:
            # Espera `interval` segundos, pero sale antes si se
            # señaliza stop_event. Esto permite un shutdown limpio
            # sin esperar 5 minutos.
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            continue
    logger.info("[hold-cleanup] Job detenido limpiamente")


def _run_hold_cleanup_once() -> int:
    """
    Ejecuta UNA pasada de la limpieza en un thread aparte.
    Retorna la cantidad de holds expirados. Aislado del loop
    asyncio para no bloquear con la latencia del sync driver
    psycopg2.
    """
    db = SessionLocal()
    try:
        repo = SeatRepository(db)
        return repo.cleanup_expired_holds()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Hook de ciclo de vida:
    - Inicializa servicios con side-effects (EmailService) para que
      el log de "EmailService inicializado" aparezca al arrancar.
    - Arranca el job de limpieza de holds expirados.
    """
    # Eager init: dispara la lectura de RESEND_API_KEY y el log
    # de estado del servicio, para detectar problemas en el arranque.
    get_email_service()

    # Job periódico de limpieza de holds. Se puede desactivar con
    # HOLD_CLEANUP_DISABLED=true (usado en los tests para que el
    # background loop no interfiera con las aserciones transaccionales
    # ni alargue el tiempo de teardown del TestClient).
    cleanup_task: asyncio.Task | None = None
    stop_event: asyncio.Event | None = None
    if not settings.HOLD_CLEANUP_DISABLED:
        stop_event = asyncio.Event()
        cleanup_task = asyncio.create_task(
            hold_cleanup_loop(stop_event),
            name="hold-cleanup-loop",
        )
        # Expone la task y el event en `app.state` para que los
        # tests puedan inspeccionarlos / esperarlos.
        app.state.hold_cleanup_task = cleanup_task
        app.state.hold_cleanup_stop = stop_event

    try:
        yield
    finally:
        # Apagado limpio: señaliza al loop y espera a que termine.
        if stop_event is not None:
            stop_event.set()
        if cleanup_task is not None:
            try:
                await asyncio.wait_for(cleanup_task, timeout=5.0)
            except asyncio.TimeoutError:
                cleanup_task.cancel()
                try:
                    await cleanup_task
                except (asyncio.CancelledError, Exception):
                    pass


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.APP_DEBUG,
    lifespan=lifespan,
    docs_url="/docs" if settings.APP_DEBUG else None,
    redoc_url="/redoc" if settings.APP_DEBUG else None,
    openapi_url="/openapi.json" if settings.APP_DEBUG else None,
)


# ============================================================================
# MIDDLEWARES
# ============================================================================

# FIX A05: headers de seguridad HTTP (CSP, HSTS, X-Frame-Options, ...)
# Se aplica PRIMERO para que TODAS las respuestas (incluidos errores
# 4xx/5xx y respuestas de CORS) lleven los headers.
app.add_middleware(SecurityHeadersMiddleware)

# FIX A07: rate limiting con slowapi.
# El middleware aplica los límites globales (default 60/min).
# Los límites específicos por endpoint se aplican con @limiter.limit
# en cada router.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# CORS: se aplica ÚLTIMO para que los headers de seguridad estén
# presentes incluso en respuestas preflight OPTIONS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# EXCEPTION HANDLERS
# ============================================================================

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError):
    """Devuelve un payload legible cuando Pydantic rechaza un body."""
    # FIX A02/A05: convertir `errors` a formato JSON-seguro antes de
    # serializar. El ctx de Pydantic puede contener objetos no
    # serializables (ValueError instances) que rompen json.dumps.
    # Usar `mode='json'` en model_dump fuerza la serialización segura.
    from fastapi.encoders import jsonable_encoder
    safe_errors = jsonable_encoder(exc.errors())
    # FIX: incluimos el detalle de los primeros errores en `detail`
    # para que el frontend pueda mostrar el campo que falló (antes
    # solo decía "Error de validación en la petición" y era opaco).
    parts = []
    for err in safe_errors[:5]:
        loc = ".".join(str(x) for x in err.get("loc", []) if x != "body")
        msg = err.get("msg", "")
        parts.append(f"{loc}: {msg}" if loc else msg)
    detail = (
        "Error de validación: " + "; ".join(parts)
        if parts
        else "Error de validación en la petición"
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": detail,
            "errors": safe_errors,
        },
    )


# ============================================================================
# HEALTH CHECK
# ============================================================================

@app.get("/", tags=["Health"], summary="Raíz de la API")
def root() -> dict:
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "env": settings.APP_ENV,
        "status": "ok",
    }


@app.get("/health", tags=["Health"], summary="Health check")
def health() -> dict:
    return {"status": "healthy"}


# ============================================================================
# ROUTERS
# ============================================================================

app.include_router(api_router)
