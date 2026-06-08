"""
Schemas Pydantic para el proceso de compra y emisión de boletos (RF-07).

Define los DTOs de entrada y salida del endpoint transaccional
`POST /v1/bookings/process`.
"""

from datetime import date
from decimal import Decimal
from typing import List

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


DOCUMENT_TYPES_FRONT = {"DNI", "CE", "Pasaporte"}
PAYMENT_METHODS = {"yape", "plin", "tarjeta"}


# ============================================================================
# ENTRADA
# ============================================================================


class CompradorSchema(BaseModel):
    """Datos del comprador principal (solo se usa para contacto y validación)."""

    tipo_documento: str = Field(..., min_length=1, max_length=30)
    numero_documento: str = Field(..., min_length=1, max_length=50)
    nombres: str = Field(..., min_length=1, max_length=200)
    apellidos: str = Field(..., min_length=1, max_length=200)
    email: EmailStr

    @field_validator("tipo_documento")
    @classmethod
    def _validate_tipo(cls, value: str) -> str:
        if value not in DOCUMENT_TYPES_FRONT:
            raise ValueError(
                f"tipo_documento debe ser uno de {sorted(DOCUMENT_TYPES_FRONT)}"
            )
        return value


class PasajeroInputSchema(BaseModel):
    """Datos de un pasajero titular de un asiento (RF-05 / RF-07)."""

    id_asiento: int = Field(..., ge=1)
    id_tipo_documento: int = Field(..., ge=1)
    numero_documento: str = Field(..., min_length=1, max_length=50)
    nombres: str = Field(..., min_length=1, max_length=100)
    apellido_paterno: str = Field(..., min_length=1, max_length=100)
    apellido_materno: str = Field(..., min_length=1, max_length=100)
    fecha_nacimiento: date


class BookingProcessRequest(BaseModel):
    """Petición consolidada para procesar el checkout completo (RF-07)."""

    token_sesion: str = Field(..., min_length=1, max_length=255)
    id_viaje: int = Field(..., ge=1)
    comprador: CompradorSchema
    pasajeros: List[PasajeroInputSchema] = Field(..., min_length=1)
    metodo_pago: str = Field(...)

    @field_validator("metodo_pago")
    @classmethod
    def _validate_metodo(cls, value: str) -> str:
        v = value.strip().lower()
        if v not in PAYMENT_METHODS:
            raise ValueError(
                f"metodo_pago debe ser uno de {sorted(PAYMENT_METHODS)}"
            )
        return v

    @field_validator("pasajeros")
    @classmethod
    def _validate_unique_seats(
        cls, value: List[PasajeroInputSchema]
    ) -> List[PasajeroInputSchema]:
        ids = [p.id_asiento for p in value]
        if len(ids) != len(set(ids)):
            raise ValueError(
                "No se puede asignar el mismo id_asiento a dos pasajeros"
            )
        return value


# ============================================================================
# SALIDA
# ============================================================================


class BoletoEmitidoSchema(BaseModel):
    """Boleto emitido, con su código QR y datos de exposición (RF-08/RF-11)."""

    model_config = ConfigDict(from_attributes=True)

    id_boleto: int
    id_asiento: int
    numero_asiento: str
    codigo_qr: str
    precio_final: Decimal
    pasajero: str


class PagoResumenSchema(BaseModel):
    """Resumen del pago registrado para la compra."""

    metodo: str
    referencia_transaccion: str
    monto_total: Decimal
    estado: str


class BookingProcessResponse(BaseModel):
    """Respuesta consolidada con los boletos emitidos y el pago."""

    codigo_reserva: str
    id_viaje: int
    total: Decimal
    estado: str
    pago: PagoResumenSchema
    boletos: List[BoletoEmitidoSchema]
