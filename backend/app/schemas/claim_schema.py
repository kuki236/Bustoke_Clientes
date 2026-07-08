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
    # FIX BUG-135: max_length evita payloads enormes (DoS por JSON pesado).
    # FIX DISCREPANCIA TEST_PLAN (TC-BB-031): min_length=15 alinea la
    # validación del backend con la regla de negocio que el frontend ya
    # enforza en `claims.js:30-32` ("El detalle debe tener al menos
    # 15 caracteres"). Antes el backend aceptaba 1 char, lo que
    # permitía bypasear la validación cliente y enviar reclamos
    # triviales (válvula de spam / baja calidad de datos).
    detalle: str = Field(..., min_length=15, max_length=5000)


class ReclamoCreate(ReclamoBase):
    """Creación de un reclamo por un pasajero."""

    pass


class ReclamoUpdate(BaseModel):
    """Actualización del estado / respuesta (RF-19)."""

    estado: Optional[str] = None
    detalle: Optional[str] = Field(default=None, max_length=5000)

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
    # FIX BUG-136: max_length evita DoS por mensajes enormes.
    text_mensaje: str = Field(..., min_length=1, max_length=5000)


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
    respuesta: str = Field(..., min_length=1, max_length=5000)

    @field_validator("estado")
    @classmethod
    def _validate_estado(cls, value: str) -> str:
        if value not in {"en_proceso", "resuelto"}:
            raise ValueError("estado debe ser 'en_proceso' o 'resuelto'")
        return value
