"""
Modelo ORM de Manifiestos SUTRAN (RF-17).

Los manifiestos son inmutables por regulación nacional; el trigger
`trg_bloquear_cambios_sutran` impide UPDATE/DELETE en la tabla.
"""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.travel import Viaje


class ManifiestoSutran(Base):
    """
    Manifiesto oficial de pasajeros para SUTRAN (RF-17).

    Almacena la respuesta completa de la API reguladora en formato JSON
    para auditoría inmutable.
    """

    __tablename__ = "manifiestos_sutran"
    __table_args__ = (
        Index("fk_manifiesto_viaje", "id_viaje"),
    )

    id_manifiesto: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_viaje: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("viajes.id_viaje", ondelete="RESTRICT"),
        nullable=False,
    )
    fecha_generacion: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    estado_envio: Mapped[str] = mapped_column(String(30), nullable=False)
    respuesta_api: Mapped[str] = mapped_column(Text, nullable=False)

    viaje: Mapped["Viaje"] = relationship("Viaje")

    def __repr__(self) -> str:
        return (
            f"<ManifiestoSutran id={self.id_manifiesto} viaje={self.id_viaje} "
            f"estado={self.estado_envio!r}>"
        )
