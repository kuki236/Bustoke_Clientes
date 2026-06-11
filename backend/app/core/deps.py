"""
Dependencias reutilizables de FastAPI para inyección en endpoints.

Aquí centralizamos piezas de "plomería" que se repiten en múltiples
rutas (extracción del usuario actual, lookup de agencia, etc.) para
evitar duplicar la lógica de Authorization en cada `router.get`.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.core.security import decode_token


_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> int:
    """
    Dependencia que extrae el `id_usuario` autenticado desde el JWT
    presente en el header `Authorization: Bearer ...`.

    Lanza `401 Unauthorized` si:
      - No se envía header / no se envía token.
      - El token es inválido o expiró.
      - El claim `sub` no es un entero válido.

    Usar en cualquier endpoint protegido con:
        @router.get(..., dependencies=[Depends(get_current_user_id)])
    o como argumento tipado de la función:
        async def handler(..., current_user_id: int = Depends(get_current_user_id)):
    """
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

    sub = payload.get("sub")
    try:
        return int(sub)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token malformado: subject inválido",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
