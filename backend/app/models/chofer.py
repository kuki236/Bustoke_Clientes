"""
Modelo ORM de Choferes (Manifiesto SUTRAN).

Los choferes NO son usuarios del sistema: no tienen email, password ni
acceso a la plataforma. Se almacenan únicamente para:

- Vincularlos a un `Viaje` y emitir el manifiesto de SUTRAN.
- Mostrarlos al pasajero en su historial de viajes y en el PDF
  del boleto.
"""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.agency import Agencia
    from app.models.location import TipoDocumento
    from app.models.travel import Viaje


class Chofer(Base):
    """
    Conductor de bus registrado por una agencia para operar viajes.

    Existe como entidad separada de `Usuario` porque los choferes
    no tienen cuenta en la plataforma: solo interesa registrar su
    identidad para el cumplimiento regulatorio (manifiesto SUTRAN)
    y la trazabilidad del viaje.
    """

    __tablename__ = "choferes"
    __table_args__ = (
        Index("fk_choferes_agencia", "id_agencia"),
        Index("fk_choferes_doc", "id_tipo_documento"),
    )

    id_chofer: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_agencia: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("agencias.id_agencia", ondelete="RESTRICT"),
        nullable=False,
    )
    id_tipo_documento: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("tipos_documento.id_tipo_documento", ondelete="RESTRICT"),
        nullable=False,
    )
    numero_documento: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    nombres: Mapped[str] = mapped_column(String(100), nullable=False)
    apellido_paterno: Mapped[str] = mapped_column(String(100), nullable=False)
    apellido_materno: Mapped[str] = mapped_column(String(100), nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    fecha_registro: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    agencia: Mapped["Agencia"] = relationship("Agencia")
    tipo_documento: Mapped["TipoDocumento"] = relationship("TipoDocumento")
    viajes: Mapped[list["Viaje"]] = relationship("Viaje", back_populates="chofer")

    @property
    def nombre_completo(self) -> str:
        return (
            f"{self.nombres} {self.apellido_paterno} {self.apellido_materno}"
        ).strip()

    def __repr__(self) -> str:
        return (
            f"<Chofer id={self.id_chofer} doc={self.numero_documento!r} "
            f"{self.nombres} {self.apellido_paterno}>"
        )
