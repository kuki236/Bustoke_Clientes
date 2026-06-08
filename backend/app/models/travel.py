"""
Modelos ORM de Viajes e Historial de cambios de estado (RF-17).

Tablas cubiertas:
- viajes
- historial_estados_viaje
"""

from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import estado_viaje_enum

if TYPE_CHECKING:
    from app.models.bus import Bus
    from app.models.route import Ruta
    from app.models.transaction import Boleto, BloqueoTemporal
    from app.models.user import Usuario


class Viaje(Base):
    """
    Itinerario (salida) de un bus en una ruta con fecha/hora determinada.

    La columna `rampa_embarque` se expone en el boleto del pasajero
    para la ruta guiada (RF-11).
    """

    __tablename__ = "viajes"
    __table_args__ = (
        CheckConstraint("fecha_hora_llegada > fecha_hora_salida", name="chk_horarios"),
        Index(
            "idx_viajes_fecha_estado",
            "fecha_hora_salida",
            "estado",
        ),
        Index("fk_viajes_ruta", "id_ruta"),
        Index("fk_viajes_bus", "id_bus"),
    )

    id_viaje: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_ruta: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("rutas.id_ruta", ondelete="RESTRICT"),
        nullable=False,
    )
    id_bus: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("buses.id_bus", ondelete="RESTRICT"),
        nullable=False,
    )
    fecha_hora_salida: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    fecha_hora_llegada: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    estado: Mapped[str] = mapped_column(
        estado_viaje_enum, nullable=False, server_default="programado"
    )
    rampa_embarque: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="Por asignar"
    )

    ruta: Mapped["Ruta"] = relationship("Ruta", back_populates="viajes")
    bus: Mapped["Bus"] = relationship("Bus", back_populates="viajes")
    boletos: Mapped[List["Boleto"]] = relationship(
        "Boleto", back_populates="viaje", cascade="all, delete-orphan"
    )
    bloqueos: Mapped[List["BloqueoTemporal"]] = relationship(
        "BloqueoTemporal", back_populates="viaje", cascade="all, delete-orphan"
    )
    historial_estados: Mapped[List["HistorialEstadoViaje"]] = relationship(
        "HistorialEstadoViaje",
        back_populates="viaje",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return (
            f"<Viaje id={self.id_viaje} ruta={self.id_ruta} bus={self.id_bus} "
            f"salida={self.fecha_hora_salida} estado={self.estado}>"
        )


class HistorialEstadoViaje(Base):
    """
    Bitácora de cambios manuales de estado de un viaje (auditoría).
    """

    __tablename__ = "historial_estados_viaje"
    __table_args__ = (
        Index("fk_historial_viaje", "id_viaje"),
    )

    id_historial: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_viaje: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("viajes.id_viaje", ondelete="CASCADE"),
        nullable=False,
    )
    estado_anterior: Mapped[str] = mapped_column(estado_viaje_enum, nullable=False)
    estado_nuevo: Mapped[str] = mapped_column(estado_viaje_enum, nullable=False)
    motivo: Mapped[str] = mapped_column(Text, nullable=False)
    id_usuario_responsable: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("usuarios.id_usuario", ondelete="SET NULL"),
        nullable=True,
    )
    fecha_cambio: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    viaje: Mapped["Viaje"] = relationship("Viaje", back_populates="historial_estados")

    def __repr__(self) -> str:
        return (
            f"<HistorialEstadoViaje id={self.id_historial} viaje={self.id_viaje} "
            f"{self.estado_anterior}->{self.estado_nuevo}>"
        )
