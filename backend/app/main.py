"""
Punto de entrada principal de la API BUSTOKE.

- Crea la instancia de FastAPI con metadatos.
- Configura CORS leyendo orígenes permitidos desde `settings`.
- Incluye el router agregador (`app.api.router`).
- Define health check y un handler de validación genérico.
- Configura logging básico e inicializa servicios con side-effects
  (EmailService, etc.) en el lifespan event.
"""

import logging

from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Carga el .env en el process environment ANTES de cualquier import
# que lea env vars vía os.getenv(). pydantic-settings (en core.config)
# tiene su propio loader, pero email_service y otros módulos usan
# os.getenv() directamente y necesitan que las vars estén exportadas.
load_dotenv()

from app.api.router import api_router
from app.core.config import settings
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


@asynccontextmanager
async def lifespan(_: FastAPI):
    """
    Hook de ciclo de vida:
    - Inicializa servicios con side-effects (EmailService) para que
      el log de "EmailService inicializado" aparezca al arrancar.
    - Tareas en background (limpieza de bloqueos expirados, etc.) se
      agregarán aquí en el futuro.
    """
    # Eager init: dispara la lectura de RESEND_API_KEY y el log
    # de estado del servicio, para detectar problemas en el arranque.
    get_email_service()
    yield


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
    errors = exc.errors()
    # FIX: incluimos el detalle de los primeros errores en `detail`
    # para que el frontend pueda mostrar el campo que falló (antes
    # solo decía "Error de validación en la petición" y era opaco).
    parts = []
    for err in errors[:5]:
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
            "errors": errors,
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
