"""
Modelo ORM de Buses (flota vehicular por agencia).
"""

from typing import TYPE_CHECKING, List

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.agency import Agencia
    from app.models.seat import Asiento
    from app.models.travel import Viaje


class Bus(Base):
    """
    Bus (unidad vehicular) de una agencia.

    Soporta flotas de 1 o 2 pisos (RF-12). La cantidad de pisos
    determina el tipo de servicio del piso 1 (VIP) y piso 2 (Normal)
    según la regla de negocio del script SQL.
    """

    __tablename__ = "buses"
    __table_args__ = (
        CheckConstraint("cantidad_pisos IN (1, 2)", name="chk_pisos"),
        Index("fk_buses_agencia", "id_agencia"),
    )

    id_bus: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_agencia: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("agencias.id_agencia", ondelete="RESTRICT"),
        nullable=False,
    )
    placa: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)
    cantidad_pisos: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")

    agencia: Mapped["Agencia"] = relationship("Agencia", back_populates="buses")
    asientos: Mapped[List["Asiento"]] = relationship(
        "Asiento", back_populates="bus", cascade="all, delete-orphan"
    )
    viajes: Mapped[List["Viaje"]] = relationship("Viaje", back_populates="bus")

    def __repr__(self) -> str:
        return f"<Bus id={self.id_bus} placa={self.placa!r} pisos={self.cantidad_pisos}>"
