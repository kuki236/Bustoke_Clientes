"""
Schemas Pydantic para Reclamos y Mensajes de reclamo (RF-09, RF-10, RF-19).
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ============================================================================
# RECLAMO
# ============================================================================

class ReclamoBase(BaseModel):
    id_agencia: int = Field(..., ge=1)
    motivo: str = Field(..., min_length=1, max_length=150)
    detalle: str = Field(..., min_length=1)


class ReclamoCreate(ReclamoBase):
    """Creación de un reclamo por un pasajero."""

    pass


class ReclamoUpdate(BaseModel):
    """Actualización del estado / respuesta (RF-19)."""

    estado: Optional[str] = None
    detalle: Optional[str] = None

    @field_validator("estado")
    @classmethod
    def _validate_estado(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        allowed = {"abierto", "en_proceso", "resuelto"}
        if value not in allowed:
            raise ValueError(f"estado debe ser uno de {sorted(allowed)}")
        return value


class ReclamoRead(ReclamoBase):
    model_config = ConfigDict(from_attributes=True)

    id_reclamo: int
    id_usuario: int
    estado: str
    fecha_creacion: datetime


# ============================================================================
# MENSAJES DE RECLAMO (chat B2B)
# ============================================================================

class MensajeReclamoBase(BaseModel):
    text_mensaje: str = Field(..., min_length=1)


class MensajeReclamoCreate(MensajeReclamoBase):
    pass


class MensajeReclamoRead(MensajeReclamoBase):
    model_config = ConfigDict(from_attributes=True)

    id_mensaje: int
    id_reclamo: int
    id_usuario: int
    fecha: datetime


class ReclamoHiloRead(ReclamoRead):
    """Reclamo con su hilo de mensajes."""

    mensajes: List[MensajeReclamoRead] = Field(default_factory=list)


# ============================================================================
# RESPUESTA ADMIN A UN RECLAMO (RF-19)
# ============================================================================

class ReclamoRespuestaAdmin(BaseModel):
    """Payload para que el admin de agencia responda / cierre un reclamo."""

    estado: str
    respuesta: str = Field(..., min_length=1)

    @field_validator("estado")
    @classmethod
    def _validate_estado(cls, value: str) -> str:
        if value not in {"en_proceso", "resuelto"}:
            raise ValueError("estado debe ser 'en_proceso' o 'resuelto'")
        return value
