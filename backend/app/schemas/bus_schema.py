"""
Schemas Pydantic para Buses (RF-12, RF-15).
"""

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class BusBase(BaseModel):
    id_agencia: int = Field(..., ge=1)
    placa: str = Field(..., min_length=1, max_length=10)
    cantidad_pisos: int = Field(default=1)

    @field_validator("cantidad_pisos")
    @classmethod
    def _validate_pisos(cls, value: int) -> int:
        if value not in (1, 2):
            raise ValueError("cantidad_pisos debe ser 1 o 2")
        return value


class BusCreate(BusBase):
    pass


class BusUpdate(BaseModel):
    placa: Optional[str] = Field(None, min_length=1, max_length=10)
    cantidad_pisos: Optional[int] = None

    @field_validator("cantidad_pisos")
    @classmethod
    def _validate_pisos(cls, value: Optional[int]) -> Optional[int]:
        if value is not None and value not in (1, 2):
            raise ValueError("cantidad_pisos debe ser 1 o 2")
        return value


class BusRead(BusBase):
    model_config = ConfigDict(from_attributes=True)

    id_bus: int
