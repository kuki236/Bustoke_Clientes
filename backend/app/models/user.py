"""
Modelos ORM de Usuarios del sistema (RF-01, RF-02).

Roles soportados: 'cliente', 'admin_agencia', 'superadmin'.
Los nombres de pasajeros se modelan en `app.models.pasajero`.
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
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import rol_usuario_enum

if TYPE_CHECKING:
    from app.models.agency import Agencia
    from app.models.transaction import Boleto


class Usuario(Base):
    """
    Usuario del sistema (RF-01, RF-02).

    - `id_agencia` aplica solo a roles administrativos.
    - `password_hash` se genera con bcrypt (`app.core.security`).
    """

    __tablename__ = "usuarios"
    __table_args__ = (
        Index("idx_usuarios_email", "email"),
        Index("fk_usuarios_agencia", "id_agencia"),
    )

    id_usuario: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    telefono: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    rol: Mapped[str] = mapped_column(rol_usuario_enum, nullable=False, server_default="cliente")
    id_agencia: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("agencias.id_agencia", ondelete="SET NULL"),
        nullable=True,
    )
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    agencia: Mapped[Optional["Agencia"]] = relationship("Agencia", back_populates="usuarios")
    boletos: Mapped[List["Boleto"]] = relationship("Boleto", back_populates="usuario")

    def __repr__(self) -> str:
        return f"<Usuario id={self.id_usuario} email={self.email!r} rol={self.rol}>"
