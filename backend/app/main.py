"""
Punto de entrada principal de la API BUSTOKE.

- Crea la instancia de FastAPI con metadatos.
- Configura CORS leyendo orígenes permitidos desde `settings`.
- Incluye el router agregador (`app.api.router`).
- Define health check y un handler de validación genérico.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    """
    Hook de ciclo de vida. Aquí se inicializarán en el futuro:
    - Pool de conexiones
    - Tareas en background (limpieza de bloqueos expirados, etc.)
    """
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
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Error de validación en la petición",
            "errors": exc.errors(),
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
