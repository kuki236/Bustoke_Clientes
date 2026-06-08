"""
Modelo ORM de Auditoría: bitácora de cambios en tablas sensibles.
"""

from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import Usuario


# Tipo portable: JSONB en PostgreSQL (producción), JSON en SQLite (tests).
JSONType = JSON().with_variant(JSONB(), "postgresql")


class AuditLog(Base):
    """
    Registro inmutable de operaciones CUD (Create/Update/Delete) sobre
    tablas críticas del sistema.
    """

    __tablename__ = "audit_logs"

    id_log: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tabla_afectada: Mapped[str] = mapped_column(String(100), nullable=False)
    accion: Mapped[str] = mapped_column(String(20), nullable=False)
    datos_anteriores: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONType, nullable=True)
    datos_nuevos: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONType, nullable=True)
    fecha: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    id_usuario_responsable: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("usuarios.id_usuario", ondelete="SET NULL"),
        nullable=True,
    )

    def __repr__(self) -> str:
        return (
            f"<AuditLog id={self.id_log} tabla={self.tabla_afectada!r} "
            f"accion={self.accion!r} usuario={self.id_usuario_responsable}>"
        )
