"""
Modelos ORM del módulo de Reclamos y Soporte (RF-09, RF-10, RF-19).

Tablas cubiertas:
- reclamos
- mensajes_reclamo
"""

from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
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
from app.models.enums import estado_reclamo_enum

if TYPE_CHECKING:
    from app.models.agency import Agencia
    from app.models.user import Usuario


class Reclamo(Base):
    """
    Reclamo de un pasajero dirigido a una agencia específica (RF-09).

    Estados posibles: 'abierto', 'en_proceso', 'resuelto' (SQL).
    """

    __tablename__ = "reclamos"
    __table_args__ = (
        Index("fk_reclamos_usuario", "id_usuario"),
        Index("fk_reclamos_agencia", "id_agencia"),
    )

    id_reclamo: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_usuario: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("usuarios.id_usuario", ondelete="RESTRICT"),
        nullable=False,
    )
    id_agencia: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("agencias.id_agencia", ondelete="RESTRICT"),
        nullable=False,
    )
    motivo: Mapped[str] = mapped_column(String(150), nullable=False)
    detalle: Mapped[str] = mapped_column(Text, nullable=False)
    estado: Mapped[str] = mapped_column(
        estado_reclamo_enum, nullable=False, server_default="abierto"
    )
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    usuario: Mapped["Usuario"] = relationship("Usuario")
    agencia: Mapped["Agencia"] = relationship("Agencia", back_populates="reclamos")
    mensajes: Mapped[List["MensajeReclamo"]] = relationship(
        "MensajeReclamo", back_populates="reclamo", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return (
            f"<Reclamo id={self.id_reclamo} agencia={self.id_agencia} "
            f"estado={self.estado} motivo={self.motivo!r}>"
        )


class MensajeReclamo(Base):
    """
    Mensaje dentro del hilo conversacional de un reclamo (chat B2B).
    """

    __tablename__ = "mensajes_reclamo"
    __table_args__ = (
        Index("idx_mensajes_reclamo_padre", "id_reclamo"),
        Index("fk_mensajes_usuario", "id_usuario"),
    )

    id_mensaje: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_reclamo: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("reclamos.id_reclamo", ondelete="CASCADE"),
        nullable=False,
    )
    id_usuario: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("usuarios.id_usuario", ondelete="RESTRICT"),
        nullable=False,
    )
    text_mensaje: Mapped[str] = mapped_column(Text, nullable=False)
    fecha: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    reclamo: Mapped["Reclamo"] = relationship("Reclamo", back_populates="mensajes")
    usuario: Mapped["Usuario"] = relationship("Usuario")

    def __repr__(self) -> str:
        return (
            f"<MensajeReclamo id={self.id_mensaje} reclamo={self.id_reclamo} "
            f"usuario={self.id_usuario}>"
        )
