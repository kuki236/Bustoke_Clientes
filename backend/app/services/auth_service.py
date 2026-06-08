"""
Servicio de Autenticación: encapsula la lógica de negocio de
registro y login de usuarios (RF-01, RF-02).

Responsabilidades:
- Validar unicidad de email antes de persistir.
- Hashear contraseñas con bcrypt antes de guardar.
- Verificar contraseñas en login usando `bcrypt.checkpw`.
- Emitir JWT de acceso + refresh usando `app.core.security`.
- Traducir violaciones a `HTTPException` semánticas.
"""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.models import Usuario
from app.repositories.user_repository import UserRepository
from app.schemas.user_schema import (
    LoginRequest,
    TokenResponse,
    UsuarioCreate,
    UsuarioRead,
)


class AuthService:
    """Orquesta registro y autenticación de pasajeros / admins."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.users = UserRepository(db)

    # ========================================================================
    # REGISTRO (RF-01)
    # ========================================================================

    def register(self, payload: UsuarioCreate) -> TokenResponse:
        """
        Registra un nuevo usuario pasajero.

        Reglas:
        - El email debe ser único.
        - El rol para pasajeros B2C es siempre `'cliente'` (enumeración
          real de PostgreSQL). Si llega otro rol, se rechaza.
        - La contraseña se hashea con bcrypt (cost=12) antes de persistir.
        - Devuelve un `TokenResponse` listo para entregar al frontend.
        """
        # 1. Validación de unicidad
        if self.users.get_by_email(payload.email):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El correo electrónico ya está registrado",
            )

        # 2. El endpoint público B2C solo permite crear pasajeros
        if payload.rol != "cliente":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="El endpoint público solo permite registrar pasajeros (rol='cliente')",
            )

        # 3. Persistencia con hash
        new_user = Usuario(
            email=payload.email,
            password_hash=hash_password(payload.password),
            telefono=payload.telefono,
            rol="cliente",
            id_agencia=None,
            activo=True,
        )
        new_user = self.users.create(new_user)

        # 4. Emisión de tokens
        return self._build_token_response(new_user)

    # ========================================================================
    # LOGIN (RF-02)
    # ========================================================================

    def login(self, payload: LoginRequest) -> TokenResponse:
        """
        Autentica a un usuario por email + contraseña.

        Reglas:
        - Si el email no existe O la contraseña no coincide: 401.
        - Si el usuario existe pero está `activo=False`: 403.
        - Si todo OK: emite access + refresh token.
        """
        user = self.users.get_by_email(payload.email)
        if user is None or not verify_password(payload.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Credenciales inválidas",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.activo:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="La cuenta está desactivada. Contacte al administrador.",
            )

        return self._build_token_response(user)

    # ========================================================================
    # REFRESH TOKEN
    # ========================================================================

    def refresh(self, user_id: int) -> TokenResponse:
        """Renueva los tokens de un usuario autenticado por su id."""
        user = self.users.get_by_id(user_id)
        if user is None or not user.activo:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Usuario no encontrado o inactivo",
            )
        return self._build_token_response(user)

    # ========================================================================
    # HELPERS
    # ========================================================================

    def _build_token_response(self, user: Usuario) -> TokenResponse:
        """Genera la dupla access+refresh token y la response estándar."""
        extra = {"rol": user.rol}
        if user.id_agencia is not None:
            extra["id_agencia"] = user.id_agencia

        access = create_access_token(subject=user.id_usuario, extra_claims=extra)
        refresh = create_refresh_token(subject=user.id_usuario)

        return TokenResponse(
            access_token=access,
            refresh_token=refresh,
            token_type="bearer",
            expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            usuario=UsuarioRead.model_validate(user),
        )
