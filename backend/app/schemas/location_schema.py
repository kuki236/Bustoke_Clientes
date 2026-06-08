"""
Schemas Pydantic para tablas geográficas, terminales y tipos de documento.
"""

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ============================================================================
# UBICACIÓN GEOGRÁFICA
# ============================================================================

class DepartamentoBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)


class DepartamentoRead(DepartamentoBase):
    model_config = ConfigDict(from_attributes=True)

    id_departamento: int


class ProvinciaBase(BaseModel):
    id_departamento: int = Field(..., ge=1)
    nombre: str = Field(..., min_length=1, max_length=100)


class ProvinciaRead(ProvinciaBase):
    model_config = ConfigDict(from_attributes=True)

    id_provincia: int


class DistritoBase(BaseModel):
    id_provincia: int = Field(..., ge=1)
    nombre: str = Field(..., min_length=1, max_length=100)


class DistritoRead(DistritoBase):
    model_config = ConfigDict(from_attributes=True)

    id_distrito: int


# ============================================================================
# TIPO DE DOCUMENTO
# ============================================================================

class TipoDocumentoBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=50)
    longitud_exacta: Optional[int] = Field(None, ge=1)


class TipoDocumentoRead(TipoDocumentoBase):
    model_config = ConfigDict(from_attributes=True)

    id_tipo_documento: int


# ============================================================================
# TERMINAL
# ============================================================================

class TerminalBase(BaseModel):
    id_distrito: int = Field(..., ge=1)
    nombre: str = Field(..., min_length=1, max_length=150)
    direccion: str = Field(..., min_length=1, max_length=255)


class TerminalCreate(TerminalBase):
    pass


class TerminalRead(TerminalBase):
    model_config = ConfigDict(from_attributes=True)

    id_terminal: int


# ============================================================================
# AGENCIA-TERMINAL (N:M con counter)
# ============================================================================

class AgenciaTerminalBase(BaseModel):
    id_agencia: int = Field(..., ge=1)
    id_terminal: int = Field(..., ge=1)
    nro_counter_oficina: str = Field(default="Por definir", max_length=50)


class AgenciaTerminalCreate(AgenciaTerminalBase):
    pass


class AgenciaTerminalRead(AgenciaTerminalBase):
    model_config = ConfigDict(from_attributes=True)

    id_agencia_terminal: int
