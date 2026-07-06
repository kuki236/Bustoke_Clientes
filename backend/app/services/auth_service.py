"""
Servicio de Autenticación: encapsula la lógica de negocio de
registro y login de usuarios (RF-01, RF-02).

Responsabilidades:
- Validar unicidad de email antes de persistir.
- Hashear contraseñas con bcrypt antes de guardar.
- Verificar contraseñas en login usando `bcrypt.checkpw`.
- Emitir JWT de acceso + refresh usando `app.core.security`.
- Coordinar transacciones atómicas multi-tabla (RF-01).
- Traducir violaciones a `HTTPException` semánticas.
"""

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    normalize_email,
    verify_password,
)
from app.models import Pasajero, Usuario
from app.repositories.pasajero_repository import PasajeroRepository
from app.repositories.user_repository import UserRepository
from app.schemas.user_schema import (
    LoginRequest,
    RegisterSchema,
    TokenResponse,
    UsuarioRead,
)


class AuthService:
    """Orquesta registro y autenticación de pasajeros / admins."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.users = UserRepository(db)
        self.pasajeros = PasajeroRepository(db)

# ========================================================================
    def register(self, payload: RegisterSchema) -> TokenResponse:
        """
        Registra un nuevo pasajero y crea de forma atómica su ficha
        personal en la tabla `pasajeros`.

        Flujo (transacción atómica):
        1. Normaliza email a minúsculas (FIX BUG-002/020) y valida
           unicidad contra el catálogo de `tipo_documento`.
        2. INSERT en `usuarios` (email, password_hash, telefono, rol='cliente').
        3. `db.flush()` para materializar el `id_usuario` autoincremental
           sin cerrar la transacción.
        4. INSERT en `pasajeros` vinculado al `id_usuario` recién creado
           (nombres, apellidos, id_tipo_documento, numero_documento).
        5. Un único `db.commit()` cierra la transacción; cualquier fallo
           intermedio dispara `IntegrityError` -> rollback automático,
           garantizando que jamás queden usuarios huérfanos.

        Devuelve un `TokenResponse` listo para entregar al frontend.
        """
# FIX BUG-002/020: normalizar email a minúsculas antes de validar
        normalized_email = normalize_email(payload.email)

        # 1. Validación de unicidad de email (pre-check; la BD también
        #    lo enforza con la UNIQUE constraint como red de seguridad).
        if self.users.get_by_email(normalized_email):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El correo electrónico ya está registrado",
            )

        # 2. Resolución de `tipo_documento` (string -> id_tipo_documento).
        #    Si el catálogo no contiene la etiqueta, se rechaza con 422.
        try:
            id_tipo_documento = self.pasajeros.resolve_tipo_documento_id(
                payload.tipo_documento
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            ) from exc

        # 3. INSERT 1: usuario (sin commit). Email ya normalizado.
        new_user = Usuario(
            email=normalized_email,
            password_hash=hash_password(payload.contrasena),
            telefono=payload.telefono,
            rol="cliente",
            id_agencia=None,
            activo=True,
        )
        self.users.add(new_user)

        # 4. flush() para que Postgres nos devuelva el id_usuario
        #    sin cerrar la transacción.
        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El correo electrónico ya está registrado",
            ) from exc

        # 5. INSERT 2: pasajero vinculado al id_usuario recién creado.
        new_pasajero = Pasajero(
            id_usuario=new_user.id_usuario,
            id_tipo_documento=id_tipo_documento,
            numero_documento=payload.numero_documento,
            nombres=payload.nombres,
            apellido_paterno=payload.apellido_paterno,
            apellido_materno=payload.apellido_materno,
            fecha_nacimiento=None,
        )
        self.pasajeros.add(new_pasajero)

# 6. Cierre de la transacción atómica. Si algo falla aquí
        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No se pudo completar el registro: datos duplicados o inválidos",
            ) from exc

        # 7. Refresca la instancia para que el response_model refleje
        #    los `server_default` (activo, fecha_creacion, ...).
        self.db.refresh(new_user)

        # 8. Emisión de tokens
        return self._build_token_response(new_user)

# ========================================================================
    def login(self, payload: LoginRequest) -> TokenResponse:
        """
        Autentica a un usuario por email + contraseña.

        Reglas:
        - Si el email no existe O la contraseña no coincide: 401.
        - Si el usuario existe pero está `activo=False`: 403.
        - Si todo OK: emite access + refresh token.

        FIX BUG-002/020: el email se normaliza a minúsculas antes de la
        búsqueda, así `juan@gmail.com` y `Juan@Gmail.com` son equivalentes.
        """
        normalized_email = normalize_email(payload.email)
        user = self.users.get_by_email(normalized_email)
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
    def get_me(self, user_id: int) -> UsuarioRead:
        """Devuelve el `UsuarioRead` enriquecido del usuario autenticado."""
        user = self.users.get_by_id(user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuario no encontrado",
            )
        return self._build_usuario_read(user)

# ========================================================================
    def _build_usuario_read(self, user: Usuario) -> UsuarioRead:
        """
        Proyecta un `Usuario` a `UsuarioRead` enriqueciéndolo con los
        datos personales del `Pasajero` vinculado (si existe).

        Para usuarios sin ficha de pasajero (admin_agencia, superadmin)
        los campos personales viajan como `None`.
        """
        usuario_read = UsuarioRead.model_validate(user)
        pasajero = self.pasajeros.get_by_user(user.id_usuario)
        if pasajero is not None:
            usuario_read.nombres = pasajero.nombres
            usuario_read.apellido_paterno = pasajero.apellido_paterno
            usuario_read.apellido_materno = pasajero.apellido_materno
            usuario_read.numero_documento = pasajero.numero_documento
            usuario_read.id_tipo_documento = pasajero.id_tipo_documento
            tipo = self.pasajeros.get_tipo_documento(pasajero.id_tipo_documento)
            if tipo is not None:
                usuario_read.tipo_documento = tipo.nombre
        return usuario_read

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
            usuario=self._build_usuario_read(user),
        )
