"""
Endpoints de autenticación B2C (RF-01, RF-02): registro, login y refresh.

Los endpoints delegan toda la lógica a `AuthService` y solo se
encargan de:
- Validar el body con Pydantic.
- Inyectar la sesión de BD con `Depends(get_db)`.
- Traducir errores de negocio a `HTTPException` semánticas.
- Aplicar rate limiting por IP (FIX A07) contra brute force.

FIX BUG rate-limit: el código original usaba `await limiter.check(...)`
que NO existe en `slowapi.Limiter` (es API de flask-limiter, no de
slowapi). El fix usa el decorator idiomático `@limiter.limit("X/minute")`,
que se evalúa en import-time y respeta la flag `limiter.enabled` para
desactivarse en pytest (`RATE_LIMIT_ENABLED=false`).
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rate_limit import limiter
from app.core.security import decode_token
from app.schemas.user_schema import (
    LoginRequest,
    RefreshRequest,
    RegisterSchema,
    TokenResponse,
    UsuarioRead,
)
from app.services.auth_service import AuthService

router = APIRouter()

# Esquema de seguridad para extraer el token Bearer de los headers.
_bearer_scheme = HTTPBearer(auto_error=False)


# ============================================================================
# POST /v1/auth/register - Registro de pasajero (RF-01)
# ============================================================================

@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar un nuevo pasajero (rol='cliente')",
    tags=["Auth"],
)
@limiter.limit("3/hour")
async def register_user(
    request: Request,  # requerido por slowapi (inyecta el Request al limiter)
    payload: RegisterSchema,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """
    Crea una cuenta de pasajero y devuelve un JWT de acceso.

    Recibe los 7 campos que envía el frontend móvil (datos de
    credenciales + datos personales) y los persiste de forma
    atómica en `usuarios` y `pasajeros` dentro de la misma
    transacción de PostgreSQL.

    - Email único (case-insensitive: FIX BUG-002/020).
    - Contraseña con mínimo 8 caracteres (hasheada con bcrypt).
    - El rol se fuerza a `'cliente'` (alineado al ENUM de PostgreSQL).
    - Rate limit: 3/hora por IP (FIX A07 anti-spam).
    """
    service = AuthService(db)
    return service.register(payload)


# ============================================================================
# POST /v1/auth/login - Login (RF-02)
# ============================================================================

@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Iniciar sesión (email + contraseña)",
    tags=["Auth"],
)
@limiter.limit("5/minute")
async def login(
    request: Request,  # requerido por slowapi (inyecta el Request al limiter)
    payload: LoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """
    Valida credenciales y emite un JWT de acceso + refresh.

    Rate limit: 5/minuto por IP (FIX A07 anti-brute-force).
    Los usuarios legítimos rara vez fallan más de 2-3 veces.
    """
    service = AuthService(db)
    return service.login(payload)


# ============================================================================
# POST /v1/auth/refresh - Renovar tokens (FIX BUG-016/021)
# ============================================================================

@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Renovar tokens a partir de un refresh_token válido",
    tags=["Auth"],
)
@limiter.limit("30/minute")
async def refresh_token(
    request: Request,  # requerido por slowapi (inyecta el Request al limiter)
    payload: RefreshRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """
    FIX BUG-016/021: ahora recibe el `refresh_token` en el BODY (no en
    el header). Esto permite que el frontend lo invoque desde el
    response interceptor de axios SIN necesidad de sobrescribir el
    Authorization header del request original.

    El `refresh_token` tiene duración de `JWT_REFRESH_TOKEN_EXPIRE_DAYS`
    (7 días por default) y es el ÚNICO mecanismo válido para obtener
    nuevos access tokens. El access_token (60 min) NO puede refrescar
    a sí mismo.

    Rate limit: 30/minuto por IP (FIX A07 anti-token-brute-force).
    """
    try:
        decoded = decode_token(payload.refresh_token)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Refresh token inválido: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if decoded.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="El token proporcionado no es un refresh_token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = int(decoded["sub"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token malformado: subject inválido",
        ) from exc

    service = AuthService(db)
    return service.refresh(user_id=user_id)


# ============================================================================
# GET /v1/auth/me - Perfil del usuario autenticado
# ============================================================================

@router.get(
    "/me",
    response_model=UsuarioRead,
    summary="Datos del usuario autenticado",
    tags=["Auth"],
)
async def get_me(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> UsuarioRead:
    """Devuelve el perfil del usuario dueño del access token."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token no proporcionado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_token(credentials.credentials)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token inválido: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token malformado",
        ) from exc

    service = AuthService(db)
    return service.get_me(user_id=user_id)
