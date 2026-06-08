"""
Modelos ORM de ubicación geográfica y terminales.

Tablas cubiertas:
- departamentos
- provincias
- distritos
- tipos_documento
- terminales
- agencias_terminales (N:M Agencia <-> Terminal con counter)
"""

from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.agency import Agencia
    from app.models.route import Ruta


class Departamento(Base):
    """Departamentos del Perú (Lima, La Libertad, Arequipa, ...)."""

    __tablename__ = "departamentos"

    id_departamento: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)

    provincias: Mapped[List["Provincia"]] = relationship(
        "Provincia",
        back_populates="departamento",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Departamento id={self.id_departamento} nombre={self.nombre!r}>"


class Provincia(Base):
    """Provincias dentro de un departamento."""

    __tablename__ = "provincias"
    __table_args__ = (
        Index("fk_provincias_departamento", "id_departamento"),
    )

    id_provincia: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_departamento: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("departamentos.id_departamento", ondelete="RESTRICT"),
        nullable=False,
    )
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)

    departamento: Mapped["Departamento"] = relationship("Departamento", back_populates="provincias")
    distritos: Mapped[List["Distrito"]] = relationship(
        "Distrito",
        back_populates="provincia",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Provincia id={self.id_provincia} nombre={self.nombre!r}>"


class Distrito(Base):
    """Distritos dentro de una provincia (sedes de terminales)."""

    __tablename__ = "distritos"
    __table_args__ = (
        Index("fk_distritos_provincia", "id_provincia"),
    )

    id_distrito: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_provincia: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("provincias.id_provincia", ondelete="RESTRICT"),
        nullable=False,
    )
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)

    provincia: Mapped["Provincia"] = relationship("Provincia", back_populates="distritos")
    terminales: Mapped[List["Terminal"]] = relationship("Terminal", back_populates="distrito")

    def __repr__(self) -> str:
        return f"<Distrito id={self.id_distrito} nombre={self.nombre!r}>"


class TipoDocumento(Base):
    """Catálogo de tipos de documento (DNI, Pasaporte, CE, ...)."""

    __tablename__ = "tipos_documento"

    id_tipo_documento: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(50), nullable=False)
    longitud_exacta: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    def __repr__(self) -> str:
        return f"<TipoDocumento id={self.id_tipo_documento} nombre={self.nombre!r}>"


class Terminal(Base):
    """Terminales terrestres físicos (origen/destino de rutas)."""

    __tablename__ = "terminales"
    __table_args__ = (
        Index("fk_terminales_distrito", "id_distrito"),
    )

    id_terminal: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_distrito: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("distritos.id_distrito", ondelete="RESTRICT"),
        nullable=False,
    )
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    direccion: Mapped[str] = mapped_column(String(255), nullable=False)

    distrito: Mapped["Distrito"] = relationship("Distrito", back_populates="terminales")
    agencias_terminales: Mapped[List["AgenciaTerminal"]] = relationship(
        "AgenciaTerminal",
        back_populates="terminal",
        cascade="all, delete-orphan",
    )
    rutas_origen: Mapped[List["Ruta"]] = relationship(
        "Ruta",
        foreign_keys="Ruta.id_terminal_origen",
        back_populates="terminal_origen",
    )
    rutas_destino: Mapped[List["Ruta"]] = relationship(
        "Ruta",
        foreign_keys="Ruta.id_terminal_destino",
        back_populates="terminal_destino",
    )

    def __repr__(self) -> str:
        return f"<Terminal id={self.id_terminal} nombre={self.nombre!r}>"


class AgenciaTerminal(Base):
    """Tabla pivote Agencia <-> Terminal con número de counter."""

    __tablename__ = "agencias_terminales"
    __table_args__ = (
        UniqueConstraint("id_agencia", "id_terminal", name="uq_agencia_terminal"),
        Index("fk_agencias_term_agencia", "id_agencia"),
        Index("fk_agencias_term_terminal", "id_terminal"),
    )

    id_agencia_terminal: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    id_agencia: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("agencias.id_agencia", ondelete="CASCADE"),
        nullable=False,
    )
    id_terminal: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("terminales.id_terminal", ondelete="CASCADE"),
        nullable=False,
    )
    nro_counter_oficina: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="Por definir"
    )

    agencia: Mapped["Agencia"] = relationship("Agencia", back_populates="agencias_terminales")
    terminal: Mapped["Terminal"] = relationship("Terminal", back_populates="agencias_terminales")

    def __repr__(self) -> str:
        return (
            f"<AgenciaTerminal id={self.id_agencia_terminal} "
            f"agencia={self.id_agencia} terminal={self.id_terminal}>"
        )
