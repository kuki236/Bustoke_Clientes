"""
Schemas Pydantic para Asientos (RF-12, RF-15, RF-18).
"""

import re
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# Patrón equivalente al CHECK de PostgreSQL: 'A4-1', 'B1-2', etc.
_ASIENTO_PATTERN = re.compile(r"^[A-Z][0-9]-[0-9]+$")


# ============================================================================
class AsientoBase(BaseModel):
    id_bus: int = Field(..., ge=1)
    numero_asiento: str = Field(
        ...,
        min_length=3,
        max_length=10,
        description="Formato: 'A4-1' (Fila, número, piso)",
    )
    fila: str = Field(..., min_length=1, max_length=5)
    piso: int = Field(default=1, ge=1, le=2)
    tipo_servicio: str = Field(default="normal")
    coord_x: int = Field(..., ge=0)
    coord_y: int = Field(..., ge=0)
    bloqueado_manual: bool = Field(
        default=False,
        description="RF-18: bloqueo administrativo permanente",
    )

    @field_validator("tipo_servicio")
    @classmethod
    def _validate_servicio(cls, value: str) -> str:
        if value not in {"normal", "vip"}:
            raise ValueError("tipo_servicio debe ser 'normal' o 'vip'")
        return value

    @field_validator("numero_asiento")
    @classmethod
    def _validate_formato(cls, value: str) -> str:
        if not _ASIENTO_PATTERN.match(value):
            raise ValueError(
                "numero_asiento debe seguir el patron '[A-Z][0-9]-N' (ej. 'A4-1')"
            )
        return value


class AsientoCreate(AsientoBase):
    pass


class AsientoUpdate(BaseModel):
    """Solo se permite actualizar `bloqueado_manual` (RF-18)."""

    bloqueado_manual: Optional[bool] = None


class AsientoRead(AsientoBase):
    model_config = ConfigDict(from_attributes=True)

    id_asiento: int


# ============================================================================
class AsientoViajeRead(BaseModel):
    """
    Asiento enriquecido con su estado en un viaje específico.

    Devuelve lo que la UI necesita para pintar la matriz del bus.
    """

    model_config = ConfigDict(from_attributes=True)

    id_viaje: int
    id_asiento: int
    numero_asiento: str
    fila: str
    piso: int
    tipo_servicio: str
    coord_x: int
    coord_y: int
    estado_interfaz: str = Field(
        ...,
        description="'libre' | 'ocupado' | 'bloqueado'",
    )


class AsientoLayoutRequest(BaseModel):
    """Petición para generar la plantilla de asientos de un bus nuevo (RF-15)."""

    id_bus: int = Field(..., ge=1)
    filas: int = Field(default=10, ge=1, le=20, description="Cantidad de filas (A..)")
    columnas: int = Field(default=4, ge=1, le=6)
    pisos: int = Field(default=1, description="1 o 2 pisos")


class AsientoBulkCreateResponse(BaseModel):
    id_bus: int
    asientos_creados: int


# ============================================================================
class AsientoMapaItem(BaseModel):
    """
    Celda de la matriz de asientos devuelta por
    `GET /v1/travels/{id_viaje}/seats`.

    `estado_interfaz` resume las tres posibles situaciones que la UI
    debe pintar:
    - `libre`: no tiene boleto activo ni bloqueo vigente.
    - `ocupado`: existe un boleto activo (RF-07).
    - `bloqueado`: existe un bloqueo temporal vigente (RF-05) o el
      asiento está deshabilitado por el administrador (RF-18).
    """

    model_config = ConfigDict(from_attributes=True)

    id_asiento: int
    numero_asiento: str = Field(..., description="Ej: 'A4-1'")
    fila: str
    piso: int = Field(..., ge=1, le=2)
    tipo_servicio: str = Field(..., description="'vip' | 'normal'")
    coord_x: int
    coord_y: int
    bloqueado_manual: bool = Field(
        default=False,
        description="RF-18: bloqueo administrativo permanente",
    )
    estado_interfaz: str = Field(
        ...,
        description="'libre' | 'ocupado' | 'bloqueado'",
    )
    precio: Decimal = Field(
        ...,
        ge=0,
        decimal_places=2,
        max_digits=10,
        description="Tarifa aplicada a este asiento (tarifas_ruta.precio)",
    )


class MapaAsientosResponse(BaseModel):
    """Mapa completo de asientos del bus asociado a un viaje."""

    id_viaje: int
    id_bus: int
    cantidad_pisos: int = Field(..., ge=1, le=2)
    asientos: List[AsientoMapaItem]


class SeatHoldRequest(BaseModel):
    """Petición al endpoint `POST /v1/seats/hold` (RF-05)."""

    id_viaje: int = Field(..., ge=1)
    id_asiento: int = Field(..., ge=1)
    segundos_ttl: Optional[int] = Field(
        default=None,
        ge=10,
        le=3600,
        description="Si no se indica, se usa SEAT_HOLD_TTL_SECONDS del .env",
    )
    token_sesion: Optional[str] = Field(
        default=None,
        max_length=255,
        description="Token de sesión del cliente. Si se omite, el servidor "
        "genera uno nuevo. Si el bloqueo vigente pertenece al mismo "
        "token, se renueva la expiración.",
    )
    id_usuario: Optional[int] = Field(
        default=None,
        ge=1,
        description="ID del usuario autenticado. Si se indica, el hold "
        "se vincula al usuario para que el release posterior "
        "lo encuentre aunque haya login state changes.",
    )


class SeatReleaseRequest(BaseModel):
    """Petición al endpoint `POST /v1/seats/release`."""

    id_viaje: int = Field(..., ge=1)
    id_asiento: int = Field(..., ge=1)
    token_sesion: Optional[str] = Field(
        default=None,
        max_length=255,
        description="Token que identifica la sesión de bloqueo. Si se omite, "
        "se libera cualquier bloqueo activo para el par (viaje, asiento).",
    )
    id_usuario: Optional[int] = Field(
        default=None,
        ge=1,
        description="ID del usuario autenticado (derivado del JWT). Si se "
        "indica, se filtra adicionalmente por dueño del bloqueo.",
    )


class SeatHoldResult(BaseModel):
    """Respuesta común de `hold` y `release`."""

    id_viaje: int
    id_asiento: int
    id_bloqueo: Optional[int] = None
    expira_at: Optional[str] = None
    estado: str = Field(..., description="'activo' | 'liberado' | 'sin_bloqueo'")
