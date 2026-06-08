"""
Modelos ORM de asientos (separado para mejor cohesión del módulo
B2B de flota y bloqueos manuales).
"""

from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import tipo_servicio_enum

if TYPE_CHECKING:
    from app.models.bus import Bus


class Asiento(Base):
    """
    Asiento físico del bus (espejo lógico de `asientos`).

    Se importa también desde `bus.py` para mantener cohesión del módulo
    de flota, pero se expone una clase adicional aquí para aquellos
    servicios que solo manipulan la matriz de asientos (bloqueos,
    selección para checkout, etc.).
    """

    __tablename__ = "asientos"
    __table_args__ = (
        UniqueConstraint("id_bus", "numero_asiento", name="uq_bus_asiento"),
        # Nota: el check `chk_formato_asiento SIMILAR TO '[A-Z][0-9]-%'`
        # vive a nivel de PostgreSQL (DDL de producción). En el ORM
        # validamos el patrón vía Pydantic (AsientoBase / AsientoCreate).
        Index("fk_asientos_bus", "id_bus"),
    )

    id_asiento: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_bus: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("buses.id_bus", ondelete="CASCADE"),
        nullable=False,
    )
    numero_asiento: Mapped[str] = mapped_column(String(10), nullable=False)
    fila: Mapped[str] = mapped_column(String(5), nullable=False)
    piso: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    tipo_servicio: Mapped[str] = mapped_column(
        tipo_servicio_enum, nullable=False, server_default="normal"
    )
    coord_x: Mapped[int] = mapped_column(Integer, nullable=False)
    coord_y: Mapped[int] = mapped_column(Integer, nullable=False)
    bloqueado_manual: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )

    bus: Mapped["Bus"] = relationship("Bus", back_populates="asientos")

    def __repr__(self) -> str:
        return (
            f"<Asiento id={self.id_asiento} num={self.numero_asiento!r} "
            f"piso={self.piso} bloqueado={self.bloqueado_manual}>"
        )
