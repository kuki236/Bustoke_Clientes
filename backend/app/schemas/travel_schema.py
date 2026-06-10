"""
Schemas Pydantic para Viajes, búsqueda con filtros y manifiesto SUTRAN
(RF-03 a RF-06, RF-11, RF-17).
"""

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

TIPO_SERVICIO_PERMITIDO = {"vip", "normal"}
TURNO_PERMITIDO = {"manana", "tarde", "noche"}


# ============================================================================
# VIAJE
# ============================================================================

class ViajeBase(BaseModel):
    id_ruta: int = Field(..., ge=1)
    id_bus: int = Field(..., ge=1)
    fecha_hora_salida: datetime
    fecha_hora_llegada: datetime
    estado: str = Field(default="programado")
    rampa_embarque: str = Field(
        default="Por asignar",
        max_length=50,
        description="RF-11: rampa física expuesta al pasajero",
    )

    @field_validator("estado")
    @classmethod
    def _validate_estado(cls, value: str) -> str:
        allowed = {"programado", "en_curso", "finalizado", "cancelado"}
        if value not in allowed:
            raise ValueError(f"estado debe ser uno de {sorted(allowed)}")
        return value

    @field_validator("fecha_hora_llegada")
    @classmethod
    def _validate_horarios(cls, value: datetime, info) -> datetime:
        salida = info.data.get("fecha_hora_salida")
        if salida is not None and value <= salida:
            raise ValueError("fecha_hora_llegada debe ser posterior a fecha_hora_salida")
        return value


class ViajeCreate(ViajeBase):
    pass


class ViajeUpdate(BaseModel):
    estado: Optional[str] = None
    rampa_embarque: Optional[str] = Field(None, max_length=50)
    fecha_hora_salida: Optional[datetime] = None
    fecha_hora_llegada: Optional[datetime] = None


class ViajeRead(ViajeBase):
    model_config = ConfigDict(from_attributes=True)

    id_viaje: int


# ============================================================================
# BÚSQUEDA DE VIAJES (RF-03, RF-04, RF-05)
# ============================================================================

class ViajeFiltros(BaseModel):
    id_terminal_origen: Optional[int] = Field(None, ge=1)
    id_terminal_destino: Optional[int] = Field(None, ge=1)
    fecha_salida: Optional[date] = Field(None, description="Filtra por fecha de salida")
    id_agencia: Optional[int] = Field(
        None,
        ge=1,
        description="DEPRECATED: usar `agencias` (lista). Se conserva por compatibilidad.",
    )
    agencias: Optional[str] = Field(
        None,
        description="Lista de IDs de agencia separadas por coma, ej: '1,3'",
    )
    precio_min: Optional[float] = Field(
        None,
        ge=0,
        description="Tarifa mínima aplicada sobre `tarifas_ruta.precio`",
    )
    precio_max: Optional[float] = Field(
        None,
        ge=0,
        description="Tarifa máxima aplicada sobre `tarifas_ruta.precio`",
    )
    tipo_servicio: Optional[str] = Field(
        None,
        description="Filtra viajes con asientos libres de la categoría 'vip' o 'normal'",
    )
    turno: Optional[str] = Field(
        None,
        description="Mañana (<12:00), Tarde (12:00-18:59), Noche (>=19:00)",
    )
    estado: Optional[str] = Field(None, description="programado, en_curso, ...")

    @field_validator("tipo_servicio")
    @classmethod
    def _validate_tipo_servicio(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        v = value.strip().lower()
        if v not in TIPO_SERVICIO_PERMITIDO:
            raise ValueError(
                f"tipo_servicio debe ser uno de {sorted(TIPO_SERVICIO_PERMITIDO)}"
            )
        return v

    @field_validator("turno")
    @classmethod
    def _validate_turno(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        v = value.strip().lower()
        if v not in TURNO_PERMITIDO:
            raise ValueError(f"turno debe ser uno de {sorted(TURNO_PERMITIDO)}")
        return v

    @field_validator("precio_max")
    @classmethod
    def _validate_precio_range(cls, value: Optional[float], info) -> Optional[float]:
        if value is None:
            return None
        precio_min = info.data.get("precio_min")
        if precio_min is not None and value < precio_min:
            raise ValueError("precio_max debe ser mayor o igual a precio_min")
        return value


class ViajeBusquedaResponse(BaseModel):
    """Viaje enriquecido con datos de ruta y terminal para la UI."""

    id_viaje: int
    id_ruta: int
    id_bus: int
    id_agencia: int
    terminal_origen: str
    terminal_destino: str
    fecha_hora_salida: datetime
    fecha_hora_llegada: datetime
    estado: str
    rampa_embarque: str = Field(..., description="RF-11")
    precio_base: Decimal = Field(
        ...,
        ge=0,
        description="Tarifa base de la ruta (rutas.tarifa_base) expuesta al cliente",
    )
    asientos_libres: int = Field(
        ...,
        ge=0,
        description="RF-05: cupos disponibles en tiempo real",
    )
    tipos_asiento: List[str] = Field(
        default_factory=list,
        description=(
            "Categorías de servicio de los asientos físicos del bus "
            "(ej: ['normal', 'vip'])"
        ),
    )


# ============================================================================
# HISTORIAL DE ESTADOS DE VIAJE
# ============================================================================

class HistorialEstadoBase(BaseModel):
    id_viaje: int = Field(..., ge=1)
    estado_anterior: str
    estado_nuevo: str
    motivo: str = Field(..., min_length=1)
    id_usuario_responsable: Optional[int] = None


class HistorialEstadoCreate(HistorialEstadoBase):
    pass


class HistorialEstadoRead(HistorialEstadoBase):
    model_config = ConfigDict(from_attributes=True)

    id_historial: int
    fecha_cambio: datetime


# ============================================================================
# MANIFIESTO SUTRAN (RF-17)
# ============================================================================

class ManifiestoSutranBase(BaseModel):
    id_viaje: int = Field(..., ge=1)
    estado_envio: str = Field(..., max_length=30)
    respuesta_api: str = Field(..., min_length=1)


class ManifiestoSutranCreate(ManifiestoSutranBase):
    pass


class ManifiestoSutranRead(ManifiestoSutranBase):
    model_config = ConfigDict(from_attributes=True)

    id_manifiesto: int
    fecha_generacion: datetime


class ManifiestoPasajeroItem(BaseModel):
    """Línea de detalle del manifiesto oficial SUTRAN."""

    dni: str = Field(..., min_length=1, max_length=20, description="Número de documento")
    nombres: str
    apellido_paterno: str
    apellido_materno: str
    numero_asiento: str = Field(..., description="Ej: 'A4-1'")
    piso: int


class ManifiestoSutranResponse(BaseModel):
    id_viaje: int
    fecha_generacion: datetime
    pasajeros: List[ManifiestoPasajeroItem]
    total_pasajeros: int
