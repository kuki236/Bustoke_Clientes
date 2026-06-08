"""
Schemas Pydantic para Transacciones: Boletos, Bloqueos, Pagos, Reembolsos
(RF-05, RF-07, RF-08, RF-11, RF-20, RF-21).
"""

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# ============================================================================
# BOLETO
# ============================================================================

class BoletoBase(BaseModel):
    id_viaje: int = Field(..., ge=1)
    id_pasajero: int = Field(..., ge=1)
    id_asiento: int = Field(..., ge=1)
    email_contacto: EmailStr = Field(..., max_length=150)
    canal: str = Field(default="app_bustoke")
    acepto_terminos_politicas: bool = Field(default=True)
    ip_registro: Optional[str] = Field(None, max_length=45)

    @field_validator("canal")
    @classmethod
    def _validate_canal(cls, value: str) -> str:
        if value not in {"app_bustoke", "ventanilla_fisica"}:
            raise ValueError("canal debe ser 'app_bustoke' o 'ventanilla_fisica'")
        return value


class BoletoCreate(BoletoBase):
    """Creación de boleto. `id_usuario` opcional (comprador registrado)."""

    id_usuario: Optional[int] = None
    precio_final: Decimal = Field(..., ge=0, decimal_places=2, max_digits=10)
    codigo_qr: Optional[str] = Field(
        None,
        max_length=255,
        description="Si no se envía, el servicio lo genera (RF-08).",
    )


class BoletoUpdate(BaseModel):
    estado: Optional[str] = None

    @field_validator("estado")
    @classmethod
    def _validate_estado(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        if value not in {"activo", "cancelado"}:
            raise ValueError("estado debe ser 'activo' o 'cancelado'")
        return value


class BoletoRead(BoletoBase):
    model_config = ConfigDict(from_attributes=True)

    id_boleto: int
    id_usuario: Optional[int] = None
    codigo_qr: str = Field(..., description="RF-08: código de reserva único")
    usado: bool
    fecha_validacion: Optional[datetime] = None
    precio_final: Decimal
    fecha_emision: datetime
    estado: str


class BoletoDetalleRead(BoletoRead):
    """Boleto enriquecido con datos del viaje y del asiento (RF-11)."""

    fecha_hora_salida: datetime
    fecha_hora_llegada: datetime
    rampa_embarque: str = Field(..., description="RF-11: rampa física de embarque")
    terminal_origen: str
    terminal_destino: str
    numero_asiento: str
    piso: int
    tipo_servicio: str


# ============================================================================
# BLOQUEO TEMPORAL (RF-05)
# ============================================================================

class BloqueoTemporalCreate(BaseModel):
    id_viaje: int = Field(..., ge=1)
    id_asiento: int = Field(..., ge=1)
    token_sesion: str = Field(..., min_length=1, max_length=255)
    segundos_ttl: Optional[int] = Field(
        default=None,
        ge=10,
        le=3600,
        description="Si no se indica, se usa SEAT_HOLD_TTL_SECONDS del .env",
    )


class BloqueoTemporalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_bloqueo: int
    id_viaje: int
    id_asiento: int
    id_usuario: Optional[int] = None
    token_sesion: str
    fecha_bloqueo: datetime
    expira_at: datetime
    estado: str


# ============================================================================
# PAGO (RF-07)
# ============================================================================

class PagoBase(BaseModel):
    metodo: str = Field(..., description="'yape', 'plin', 'tarjeta'")
    monto_total: Decimal = Field(..., ge=0, decimal_places=2, max_digits=10)
    referencia_transaccion: str = Field(..., min_length=1, max_length=100)

    @field_validator("metodo")
    @classmethod
    def _validate_metodo(cls, value: str) -> str:
        if value not in {"yape", "plin", "tarjeta"}:
            raise ValueError("metodo debe ser 'yape', 'plin' o 'tarjeta'")
        return value


class PagoCreate(PagoBase):
    id_boleto: int = Field(..., ge=1)


class PagoUpdate(BaseModel):
    estado: Optional[str] = None

    @field_validator("estado")
    @classmethod
    def _validate_estado(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        if value not in {"pendiente", "completado", "fallido", "reembolsado"}:
            raise ValueError("estado inválido")
        return value


class PagoRead(PagoBase):
    model_config = ConfigDict(from_attributes=True)

    id_pago: int
    id_boleto: int
    estado: str


# ============================================================================
# REEMBOLSO
# ============================================================================

class ReembolsoBase(BaseModel):
    id_pago: int = Field(..., ge=1)
    monto_reembolsado: Decimal = Field(..., ge=0, decimal_places=2, max_digits=10)
    motivo: str = Field(..., min_length=1)


class ReembolsoCreate(ReembolsoBase):
    id_usuario_responsable: Optional[int] = None


class ReembolsoRead(ReembolsoBase):
    model_config = ConfigDict(from_attributes=True)

    id_reembolso: int
    id_usuario_responsable: Optional[int] = None
    fecha_reembolso: datetime


# ============================================================================
# CHECKOUT INTEGRAL (RF-07)
# ============================================================================

class CheckoutRequest(BaseModel):
    """Petición consolidada para comprar un boleto + emitir pago."""

    id_viaje: int
    id_asiento: int
    pasajero: dict = Field(..., description="Datos del pasajero titular (RF-05)")
    email_contacto: EmailStr
    metodo_pago: str
    acepto_terminos: bool = True
    ip_registro: Optional[str] = None


class CheckoutResponse(BaseModel):
    boleto: BoletoRead
    pago: PagoRead
    rampa_embarque: str = Field(..., description="RF-11")
    numero_asiento: str
