"""
Modelo ORM de Pasajeros (titulares de viajes, RF-05).
"""

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import (
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import Usuario


class Pasajero(Base):
    """
    Pasajero titular de un viaje (RF-05).

    Un pasajero puede estar vinculado opcionalmente a un `Usuario` (si
    compró con cuenta) o ser independiente (invitado). Los nombres se
    almacenan separados: `nombres`, `apellido_paterno`, `apellido_materno`
    según requisitos RF-01 / RF-02.
    """

    __tablename__ = "pasajeros"
    __table_args__ = (
        Index("fk_pasajeros_usuario", "id_usuario"),
        Index("fk_pasajeros_doc", "id_tipo_documento"),
    )

    id_pasajero: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_usuario: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("usuarios.id_usuario", ondelete="SET NULL"),
        nullable=True,
    )
    id_tipo_documento: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("tipos_documento.id_tipo_documento", ondelete="RESTRICT"),
        nullable=False,
    )
    numero_documento: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    nombres: Mapped[str] = mapped_column(String(100), nullable=False)
    apellido_paterno: Mapped[str] = mapped_column(String(100), nullable=False)
    apellido_materno: Mapped[str] = mapped_column(String(100), nullable=False)
    fecha_nacimiento: Mapped[date | None] = mapped_column(Date, nullable=True)

    usuario: Mapped["Usuario | None"] = relationship("Usuario")

    def __repr__(self) -> str:
        return (
            f"<Pasajero id={self.id_pasajero} doc={self.numero_documento!r} "
            f"{self.nombres} {self.apellido_paterno}>"
        )
