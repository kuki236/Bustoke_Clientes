"""
Utilidades de seguridad: hashing de contraseñas, JWT y API Keys.

Centraliza la criptografía usada por:
- RF-01 / RF-02: Autenticación de pasajeros y administradores.
- RF-16: API Keys de larga duración para integraciones B2B.

Nota: Se usa `bcrypt` directamente en lugar de `passlib` para evitar
problemas de compatibilidad con `bcrypt >= 4.1` (passlib 1.7.4 aún no
se ha actualizado a la nueva API interna del módulo).
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Union

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings


# Límite nativo de bcrypt: 72 bytes. Truncamos explícitamente para
# mantener el contrato del proyecto.
_BCRYPT_MAX_BYTES = 72


# ============================================================================
# PASSWORD HASHING
# ============================================================================

def _truncate(plain_password: str) -> bytes:
    """Convierte a bytes y trunca a 72 bytes para evitar ValueError."""
    encoded = plain_password.encode("utf-8")
    return encoded[:_BCRYPT_MAX_BYTES]


def hash_password(plain_password: str) -> str:
    """Genera un hash bcrypt (cost=12) de la contraseña en texto plano."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(_truncate(plain_password), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica que una contraseña coincida con su hash bcrypt."""
    if not hashed_password:
        return False
    try:
        return bcrypt.checkpw(
            _truncate(plain_password),
            hashed_password.encode("utf-8"),
        )
    except (ValueError, TypeError):
        return False


# ============================================================================
# JWT (JSON Web Tokens) - Autenticación de usuarios
# ============================================================================

def create_access_token(
    subject: Union[str, int],
    extra_claims: Optional[Dict[str, Any]] = None,
    expires_minutes: Optional[int] = None,
) -> str:
    """
    Crea un JWT de acceso.

    Args:
        subject: Identificador único del usuario (id_usuario o email).
        extra_claims: Claims adicionales (rol, id_agencia, etc.).
        expires_minutes: Minutos hasta la expiración.
    """
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes or settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload: Dict[str, Any] = {
        "sub": str(subject),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(
    subject: Union[str, int],
    expires_days: Optional[int] = None,
) -> str:
    """Crea un refresh token de larga duración."""
    expire = datetime.now(timezone.utc) + timedelta(
        days=expires_days or settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload: Dict[str, Any] = {
        "sub": str(subject),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "refresh",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
    """
    Decodifica y valida un JWT. Lanza JWTError si es inválido o expiró.
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except JWTError as exc:
        raise JWTError(f"Token inválido o expirado: {exc}") from exc


def normalize_email(email: str) -> str:
    """
    FIX BUG-002/020/XBUG-033: normaliza emails a minúsculas y hace
    strip de espacios. El índice único de la BD (`uq_usuarios_email_lower`)
    también es case-insensitive, por lo que un email registrado con
    mayúsculas no colisiona con su versión en minúsculas.
    """
    if email is None:
        return ""
    return str(email).strip().lower()


# ============================================================================
# API KEYS (RF-16) - Tokens para integraciones B2B de ventanilla física
# ============================================================================

def generate_api_key() -> str:
    """
    Genera un API Key seguro para integraciones externas (RF-16).

    Usa el mismo SECRET_KEY como firma; se persiste en la tabla
    `api_keys` y se valida en cada request de sistemas externos.
    """
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.JWT_API_KEY_EXPIRE_DAYS
    )
    payload: Dict[str, Any] = {
        "type": "api_key",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
