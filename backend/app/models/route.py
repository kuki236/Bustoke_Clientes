"""
Modelos ORM de Rutas y Tarifas por servicio (RF-13, RF-14).

Tablas cubiertas:
- rutas
- tarifas_ruta
"""

from decimal import Decimal
from typing import TYPE_CHECKING, List

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import tipo_servicio_enum

if TYPE_CHECKING:
    from app.models.agency import Agencia
    from app.models.location import Terminal
    from app.models.travel import Viaje


class Ruta(Base):
    """
    Ruta troncal: origen -> destino operada por una agencia.

    La restricción `chk_ruta_distinta` impide registrar una ruta donde
    el origen y el destino coincidan. La `tarifa_base` actúa como valor
    de referencia; el precio real se obtiene de `tarifas_ruta`.
    """

    __tablename__ = "rutas"
    __table_args__ = (
        CheckConstraint("id_terminal_origen <> id_terminal_destino", name="chk_ruta_distinta"),
        Index(
            "idx_rutas_origen_destino",
            "id_terminal_origen",
            "id_terminal_destino",
        ),
        Index("fk_rutas_agencia", "id_agencia"),
        Index("fk_rutas_origen", "id_terminal_origen"),
        Index("fk_rutas_destino", "id_terminal_destino"),
    )

    id_ruta: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_agencia: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("agencias.id_agencia", ondelete="RESTRICT"),
        nullable=False,
    )
    id_terminal_origen: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("terminales.id_terminal", ondelete="RESTRICT"),
        nullable=False,
    )
    id_terminal_destino: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("terminales.id_terminal", ondelete="RESTRICT"),
        nullable=False,
    )
    tarifa_base: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    agencia: Mapped["Agencia"] = relationship("Agencia", back_populates="rutas")
    terminal_origen: Mapped["Terminal"] = relationship(
        "Terminal",
        foreign_keys=[id_terminal_origen],
        back_populates="rutas_origen",
    )
    terminal_destino: Mapped["Terminal"] = relationship(
        "Terminal",
        foreign_keys=[id_terminal_destino],
        back_populates="rutas_destino",
    )
    tarifas: Mapped[List["TarifaRuta"]] = relationship(
        "TarifaRuta", back_populates="ruta", cascade="all, delete-orphan"
    )
    viajes: Mapped[List["Viaje"]] = relationship("Viaje", back_populates="ruta")

    def __repr__(self) -> str:
        return (
            f"<Ruta id={self.id_ruta} origen={self.id_terminal_origen} "
            f"destino={self.id_terminal_destino} base={self.tarifa_base}>"
        )


class TarifaRuta(Base):
    """
    Tarifa segmentada por tipo de servicio (Normal / VIP) para una ruta (RF-13).
    """

    __tablename__ = "tarifas_ruta"
    __table_args__ = (
        UniqueConstraint("id_ruta", "tipo_servicio", name="uq_ruta_servicio"),
        Index("fk_tarifas_ruta", "id_ruta"),
    )

    id_tarifa: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_ruta: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("rutas.id_ruta", ondelete="CASCADE"),
        nullable=False,
    )
    tipo_servicio: Mapped[str] = mapped_column(tipo_servicio_enum, nullable=False)
    precio: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    ruta: Mapped["Ruta"] = relationship("Ruta", back_populates="tarifas")

    def __repr__(self) -> str:
        return (
            f"<TarifaRuta id={self.id_tarifa} ruta={self.id_ruta} "
            f"servicio={self.tipo_servicio} precio={self.precio}>"
        )
