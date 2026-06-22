"""
Schemas Pydantic para Usuarios y Pasajeros (RF-01, RF-02).

Convención:
- `*Create`:  datos de entrada (registro / creación).
- `*Update`:  datos parciales para actualización.
- `*Read`:    representación de salida (lo que se devuelve al cliente).
- `*InDB`:    datos sensibles ya almacenados (incluye password_hash).
"""

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# ============================================================================
# REGISTRO B2C (RF-01) - Payload completo del frontend móvil
# ============================================================================

class RegisterSchema(BaseModel):
    """
    Payload de registro recibido por `POST /v1/auth/register`.

    Consolida en un único esquema los 7 campos que envía la app móvil
    (datos de credenciales + datos personales del pasajero):

    - `nombres`, `apellido_paterno`, `apellido_materno`
    - `tipo_documento` (string, p.ej. 'DNI', 'Pasaporte', 'CE')
    - `numero_documento`
    - `telefono`
    - `email`
    - `contrasena` (alias de `password` para mantener el contrato del FE)

    La contraseña llega en texto plano; el service la hashea con bcrypt
    antes de persistirla. El rol se fuerza a `'cliente'` y el campo
    `tipo_documento` se traduce a `id_tipo_documento` consultando
    la tabla catálogo `tipos_documento` (RF-01).
    """

    nombres: str = Field(..., min_length=1, max_length=100)
    apellido_paterno: str = Field(..., min_length=1, max_length=100)
    apellido_materno: str = Field(..., min_length=1, max_length=100)
    tipo_documento: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Etiqueta del tipo de documento (DNI, Pasaporte, CE, ...)",
    )
    numero_documento: str = Field(..., min_length=1, max_length=50)
    telefono: str = Field(..., min_length=1, max_length=20)
    email: EmailStr = Field(..., max_length=150)
    contrasena: str = Field(
        ...,
        min_length=8,
        max_length=128,
        alias="contrasena",
        description="Contraseña en texto plano (se hashea con bcrypt)",
    )

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


# ============================================================================
# USUARIO
# ============================================================================

class UsuarioBase(BaseModel):
    """Campos base de un usuario."""

    email: EmailStr = Field(..., max_length=150, description="Correo único del usuario")
    telefono: Optional[str] = Field(None, max_length=20)


class UsuarioCreate(UsuarioBase):
    """
    Datos para registrar un nuevo usuario (RF-01, RF-02).

    El tipo de documento por defecto es 'DNI' (id_tipo_documento=1)
    según la convención de la base de datos.
    """

    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Contraseña en texto plano (se hashea con bcrypt)",
    )
    rol: str = Field(
        default="cliente",
        description="Rol: 'cliente', 'admin_agencia', 'superadmin'",
    )
    id_agencia: Optional[int] = Field(
        default=None,
        description="Requerido para rol 'admin_agencia'",
    )

    @field_validator("rol")
    @classmethod
    def _validate_rol(cls, value: str) -> str:
        allowed = {"cliente", "admin_agencia", "superadmin"}
        if value not in allowed:
            raise ValueError(f"rol debe ser uno de {sorted(allowed)}")
        return value


class UsuarioUpdate(BaseModel):
    """Patch parcial de un usuario existente."""

    email: Optional[EmailStr] = Field(None, max_length=150)
    telefono: Optional[str] = Field(None, max_length=20)
    password: Optional[str] = Field(None, min_length=8, max_length=128)
    activo: Optional[bool] = None


class UsuarioRead(UsuarioBase):
    """Representación pública de un usuario.

    Los campos `nombres` y `apellido_paterno` se proyectan desde la
    tabla `pasajeros` cuando el `Usuario` está vinculado a un registro
    `Pasajero` (caso B2C). Para usuarios administrativos (rol distinto
    a `'cliente'`) viajan como `None`.
    """

    model_config = ConfigDict(from_attributes=True)

    id_usuario: int
    rol: str
    id_agencia: Optional[int] = None
    activo: bool
    fecha_creacion: datetime
    nombres: Optional[str] = None
    apellido_paterno: Optional[str] = None
    apellido_materno: Optional[str] = None
    numero_documento: Optional[str] = None
    id_tipo_documento: Optional[int] = None
    tipo_documento: Optional[str] = None


class UsuarioInDB(UsuarioRead):
    """Usuario completo tal y como está almacenado (incluye hash)."""

    password_hash: str


# ============================================================================
# LOGIN
# ============================================================================

class LoginRequest(BaseModel):
    """Credenciales para el endpoint de autenticación (RF-01)."""

    email: EmailStr
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    """Respuesta estándar de un login exitoso."""

    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: int = Field(..., description="Segundos hasta la expiración del access token")
    usuario: UsuarioRead


class RefreshRequest(BaseModel):
    """
    FIX BUG-016/021: payload para `POST /v1/auth/refresh`.
    El frontend envía el `refresh_token` (NO el access token) en el body.
    """

    refresh_token: str = Field(..., min_length=10, max_length=2048)


# ============================================================================
# PASAJERO
# ============================================================================

class PasajeroBase(BaseModel):
    """Datos comunes del pasajero titular (RF-05)."""

    nombres: str = Field(..., min_length=1, max_length=100)
    apellido_paterno: str = Field(..., min_length=1, max_length=100)
    apellido_materno: str = Field(..., min_length=1, max_length=100)
    numero_documento: str = Field(..., min_length=1, max_length=50)
    id_tipo_documento: int = Field(
        default=1,
        description="1 = DNI por defecto. Otros: Pasaporte, Carnet de Extranjería.",
    )
    fecha_nacimiento: date


class PasajeroCreate(PasajeroBase):
    """Creación de pasajero. `id_usuario` es opcional (invitado)."""

    id_usuario: Optional[int] = None


class PasajeroUpdate(BaseModel):
    """Actualización parcial de un pasajero."""

    nombres: Optional[str] = Field(None, min_length=1, max_length=100)
    apellido_paterno: Optional[str] = Field(None, min_length=1, max_length=100)
    apellido_materno: Optional[str] = Field(None, min_length=1, max_length=100)
    fecha_nacimiento: Optional[date] = None


class PasajeroRead(PasajeroBase):
    """Representación de salida del pasajero."""

    model_config = ConfigDict(from_attributes=True)

    id_pasajero: int
    id_usuario: Optional[int] = None
    nombre_completo: Optional[str] = Field(
        default=None,
        description="Helper para UI: concatena nombres + apellidos",
    )

    @classmethod
    def from_orm_with_fullname(cls, obj) -> "PasajeroRead":
        return cls(
            id_pasajero=obj.id_pasajero,
            id_usuario=obj.id_usuario,
            id_tipo_documento=obj.id_tipo_documento,
            numero_documento=obj.numero_documento,
            nombres=obj.nombres,
            apellido_paterno=obj.apellido_paterno,
            apellido_materno=obj.apellido_materno,
            fecha_nacimiento=obj.fecha_nacimiento,
            nombre_completo=f"{obj.nombres} {obj.apellido_paterno} {obj.apellido_materno}",
        )
