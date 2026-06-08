"""
Schemas Pydantic para Agencias, Planes, Suscripciones, API Keys,
Liquidaciones, Comisiones y Tickets de Soporte B2B (RF-12 a RF-25).
"""

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ============================================================================
# AGENCIA
# ============================================================================

class AgenciaBase(BaseModel):
    ruc: str = Field(
        ...,
        min_length=11,
        max_length=11,
        description="RUC peruano de 11 dígitos",
    )
    razon_social: str = Field(..., min_length=1, max_length=205)
    estado: str = Field(default="activa")
    banco_nombre: Optional[str] = Field(None, max_length=100)
    numero_cuenta: Optional[str] = Field(None, max_length=50)
    cuenta_cci: Optional[str] = Field(None, max_length=50)

    @field_validator("estado")
    @classmethod
    def _validate_estado(cls, value: str) -> str:
        if value not in {"activa", "suspendida"}:
            raise ValueError("estado debe ser 'activa' o 'suspendida'")
        return value

    @field_validator("ruc")
    @classmethod
    def _validate_ruc_digits(cls, value: str) -> str:
        if not value.isdigit():
            raise ValueError("El RUC debe contener solo dígitos")
        return value


class AgenciaCreate(AgenciaBase):
    """Creación de una agencia."""


class AgenciaUpdate(BaseModel):
    """Actualización parcial de una agencia."""

    razon_social: Optional[str] = Field(None, max_length=205)
    estado: Optional[str] = None
    banco_nombre: Optional[str] = Field(None, max_length=100)
    numero_cuenta: Optional[str] = Field(None, max_length=50)
    cuenta_cci: Optional[str] = Field(None, max_length=50)


class AgenciaRead(AgenciaBase):
    model_config = ConfigDict(from_attributes=True)

    id_agencia: int


# ============================================================================
# PLANES
# ============================================================================

class PlanBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)
    precio: Decimal = Field(..., ge=0, decimal_places=2, max_digits=10)
    limite_buses: int = Field(..., ge=0)


class PlanCreate(PlanBase):
    pass


class PlanRead(PlanBase):
    model_config = ConfigDict(from_attributes=True)

    id_plan: int


# ============================================================================
# SUSCRIPCIONES (RF-24)
# ============================================================================

class SuscripcionBase(BaseModel):
    id_agencia: int = Field(..., ge=1)
    id_plan: int = Field(..., ge=1)
    monto_mensual: Decimal = Field(..., ge=0, decimal_places=2, max_digits=10)
    fecha_facturacion: date
    estado_cobro: str = Field(default="pendiente")

    @field_validator("estado_cobro")
    @classmethod
    def _validate_estado(cls, value: str) -> str:
        allowed = {"pendiente", "completado", "fallido", "reembolsado"}
        if value not in allowed:
            raise ValueError(f"estado_cobro debe ser uno de {sorted(allowed)}")
        return value


class SuscripcionCreate(SuscripcionBase):
    pass


class SuscripcionUpdate(BaseModel):
    estado_cobro: Optional[str] = None


class SuscripcionRead(SuscripcionBase):
    model_config = ConfigDict(from_attributes=True)

    id_suscripcion: int


# ============================================================================
# COMISIONES (RF-22)
# ============================================================================

class ComisionBase(BaseModel):
    id_agencia: Optional[int] = Field(
        default=None,
        description="NULL = comisión global; valor = comisión específica",
    )
    porcentaje_comision: Decimal = Field(
        default=Decimal("0.00"),
        ge=0,
        le=100,
        decimal_places=2,
        max_digits=5,
    )
    monto_fijo_comision: Decimal = Field(
        default=Decimal("0.00"),
        ge=0,
        decimal_places=2,
        max_digits=10,
    )
    fecha_inicio: date
    fecha_fin: Optional[date] = None


class ComisionCreate(ComisionBase):
    pass


class ComisionRead(ComisionBase):
    model_config = ConfigDict(from_attributes=True)

    id_configuracion: int


# ============================================================================
# LIQUIDACIONES (RF-25)
# ============================================================================

class LiquidacionBase(BaseModel):
    id_agencia: int = Field(..., ge=1)
    periodo: str = Field(
        ...,
        pattern=r"^\d{4}-\d{2}$",
        description="Periodo en formato 'YYYY-MM'",
    )
    monto_ventas: Decimal = Field(..., ge=0, decimal_places=2, max_digits=10)
    comision_plataforma: Decimal = Field(..., ge=0, decimal_places=2, max_digits=10)
    monto_a_transferir: Decimal = Field(..., ge=0, decimal_places=2, max_digits=10)
    estado_pago: str = Field(default="pendiente")


class LiquidacionCreate(LiquidacionBase):
    pass


class LiquidacionUpdate(BaseModel):
    estado_pago: Optional[str] = None


class LiquidacionRead(LiquidacionBase):
    model_config = ConfigDict(from_attributes=True)

    id_liquidacion_agencia: int


# ============================================================================
# API KEYS (RF-16)
# ============================================================================

class ApiKeyCreate(BaseModel):
    id_agencia: int = Field(..., ge=1)
    fecha_expiracion: datetime


class ApiKeyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_api_key: int
    id_agencia: int
    token: str = Field(..., description="Token JWT de larga duración")
    fecha_creacion: datetime
    fecha_expiracion: datetime
    ultimo_uso: Optional[datetime] = None
    estado: bool


class ApiKeyRevoke(BaseModel):
    """Petición para desactivar una API Key."""

    id_api_key: int


# ============================================================================
# TICKETS DE SOPORTE
# ============================================================================

class TicketSoporteBase(BaseModel):
    id_agencia: int = Field(..., ge=1)
    asunto: str = Field(..., min_length=1, max_length=150)
    descripcion: str = Field(..., min_length=1)


class TicketSoporteCreate(TicketSoporteBase):
    pass


class TicketSoporteUpdate(BaseModel):
    estado: Optional[str] = None

    @field_validator("estado")
    @classmethod
    def _validate_estado(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        allowed = {"abierto", "en_revision", "resuelto"}
        if value not in allowed:
            raise ValueError(f"estado debe ser uno de {sorted(allowed)}")
        return value


class TicketSoporteRead(TicketSoporteBase):
    model_config = ConfigDict(from_attributes=True)

    id_ticket_soporte: int
    estado: str
    fecha_creacion: datetime
