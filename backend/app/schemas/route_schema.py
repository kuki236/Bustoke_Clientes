"""
Schemas Pydantic para Rutas y Tarifas (RF-04, RF-13, RF-14).
"""

from decimal import Decimal
from datetime import date
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ============================================================================
# RUTA
# ============================================================================

class RutaBase(BaseModel):
    id_agencia: int = Field(..., ge=1)
    id_terminal_origen: int = Field(..., ge=1)
    id_terminal_destino: int = Field(..., ge=1)
    tarifa_base: Decimal = Field(..., ge=0, decimal_places=2, max_digits=10)

    @field_validator("id_terminal_destino")
    @classmethod
    def _validate_distintos(cls, value: int, info) -> int:
        origen = info.data.get("id_terminal_origen")
        if origen is not None and value == origen:
            raise ValueError("id_terminal_origen e id_terminal_destino deben ser distintos")
        return value


class RutaCreate(RutaBase):
    pass


class RutaUpdate(BaseModel):
    tarifa_base: Optional[Decimal] = Field(None, ge=0, decimal_places=2, max_digits=10)


class RutaRead(RutaBase):
    model_config = ConfigDict(from_attributes=True)

    id_ruta: int


# ============================================================================
# TARIFAS POR SERVICIO (RF-13)
# ============================================================================

class TarifaRutaBase(BaseModel):
    id_ruta: int = Field(..., ge=1)
    tipo_servicio: str = Field(..., description="'normal' o 'vip'")
    precio: Decimal = Field(..., ge=0, decimal_places=2, max_digits=10)

    @field_validator("tipo_servicio")
    @classmethod
    def _validate_servicio(cls, value: str) -> str:
        if value not in {"normal", "vip"}:
            raise ValueError("tipo_servicio debe ser 'normal' o 'vip'")
        return value


class TarifaRutaCreate(TarifaRutaBase):
    pass


class TarifaRutaRead(TarifaRutaBase):
    model_config = ConfigDict(from_attributes=True)

    id_tarifa: int


# ============================================================================
# FILTROS DE BÚSQUEDA DE RUTAS (RF-04)
# ============================================================================

class RutaFiltros(BaseModel):
    id_terminal_origen: Optional[int] = Field(None, ge=1)
    id_terminal_destino: Optional[int] = Field(None, ge=1)
    fecha_viaje: Optional[date] = None
    id_agencia: Optional[int] = Field(None, ge=1)


class RutaBusquedaResponse(BaseModel):
    """Respuesta de búsqueda de rutas disponibles."""

    id_ruta: int
    id_agencia: int
    terminal_origen: str
    terminal_destino: str
    tarifa_base: Decimal
    tarifas: List[TarifaRutaRead] = Field(default_factory=list)
