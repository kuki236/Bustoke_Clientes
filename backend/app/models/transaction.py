"""
Modelos ORM del módulo de Transacciones (RF-05, RF-07, RF-08, RF-18, RF-21).

Tablas cubiertas:
- boletos
- bloqueos_temporales
- pagos
- reembolsos
"""

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import (
    canal_venta_enum,
    estado_bloqueo_temporal_enum,
    estado_boleto_enum,
    estado_pago_enum,
    metodo_pago_enum,
)

if TYPE_CHECKING:
    from app.models.pasajero import Pasajero
    from app.models.seat import Asiento
    from app.models.travel import Viaje
    from app.models.user import Usuario


# ============================================================================
# BOLETOS (RF-07, RF-08, RF-11)
# ============================================================================

class Boleto(Base):
    """
    Boleto emitido.

    La combinación (id_viaje, id_asiento) es única: no puede existir
    más de un boleto activo para el mismo asiento en un mismo viaje
    (uq_viaje_asiento). El `codigo_qr` es el código de reserva único.
    """

    __tablename__ = "boletos"
    __table_args__ = (
        UniqueConstraint("id_viaje", "id_asiento", name="uq_viaje_asiento"),
        Index("fk_boletos_viaje", "id_viaje"),
        Index("fk_boletos_usuario", "id_usuario"),
        Index("fk_boletos_pasajero", "id_pasajero"),
        Index("fk_boletos_asiento", "id_asiento"),
    )

    id_boleto: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_viaje: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("viajes.id_viaje", ondelete="RESTRICT"),
        nullable=False,
    )
    id_usuario: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("usuarios.id_usuario", ondelete="SET NULL"),
        nullable=True,
    )
    id_pasajero: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("pasajeros.id_pasajero", ondelete="RESTRICT"),
        nullable=False,
    )
    id_asiento: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("asientos.id_asiento", ondelete="RESTRICT"),
        nullable=False,
    )
    email_contacto: Mapped[str] = mapped_column(String(150), nullable=False)
    canal: Mapped[str] = mapped_column(canal_venta_enum, nullable=False)
    codigo_qr: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    usado: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    fecha_validacion: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    precio_final: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    fecha_emision: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    estado: Mapped[str] = mapped_column(
        estado_boleto_enum, nullable=False, server_default="activo"
    )
    acepto_terminos_politicas: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    ip_registro: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)

    viaje: Mapped["Viaje"] = relationship("Viaje", back_populates="boletos")
    usuario: Mapped[Optional["Usuario"]] = relationship("Usuario", back_populates="boletos")
    pasajero: Mapped["Pasajero"] = relationship("Pasajero")
    asiento: Mapped["Asiento"] = relationship("Asiento")
    pago: Mapped[Optional["Pago"]] = relationship(
        "Pago", back_populates="boleto", uselist=False, cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return (
            f"<Boleto id={self.id_boleto} viaje={self.id_viaje} asiento={self.id_asiento} "
            f"qr={self.codigo_qr!r} estado={self.estado}>"
        )


# ============================================================================
# BLOQUEOS TEMPORALES (RF-05: hold durante checkout)
# ============================================================================

class BloqueoTemporal(Base):
    """
    Bloqueo temporal de un asiento durante el flujo de pago (RF-05).
    Tiene un índice único parcial para evitar dos bloqueos activos
    para el mismo (viaje, asiento) - replicado a nivel ORM mediante
    `UniqueConstraint` adicional. La validación se hace también en BD.
    """

    __tablename__ = "bloqueos_temporales"
    __table_args__ = (
        Index("fk_bloqueos_viaje", "id_viaje"),
        Index("fk_bloqueos_asiento", "id_asiento"),
    )

    id_bloqueo: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_viaje: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("viajes.id_viaje", ondelete="CASCADE"),
        nullable=False,
    )
    id_asiento: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("asientos.id_asiento", ondelete="CASCADE"),
        nullable=False,
    )
    id_usuario: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("usuarios.id_usuario", ondelete="SET NULL"),
        nullable=True,
    )
    token_sesion: Mapped[str] = mapped_column(String(255), nullable=False)
    fecha_bloqueo: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    expira_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    estado: Mapped[str] = mapped_column(
        estado_bloqueo_temporal_enum, nullable=False, server_default="activo"
    )

    viaje: Mapped["Viaje"] = relationship("Viaje", back_populates="bloqueos")
    asiento: Mapped["Asiento"] = relationship("Asiento")

    def __repr__(self) -> str:
        return (
            f"<BloqueoTemporal id={self.id_bloqueo} viaje={self.id_viaje} "
            f"asiento={self.id_asiento} estado={self.estado}>"
        )


# ============================================================================
# PAGOS (RF-07)
# ============================================================================

class Pago(Base):
    """
    Registro contable del pago en la pasarela centralizada de Bustoke.
    Relación 1:1 con un Boleto (id_boleto UNIQUE).
    """

    __tablename__ = "pagos"

    id_pago: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_boleto: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("boletos.id_boleto", ondelete="RESTRICT"),
        unique=True,
        nullable=False,
    )
    metodo: Mapped[str] = mapped_column(metodo_pago_enum, nullable=False)
    monto_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    referencia_transaccion: Mapped[str] = mapped_column(String(100), nullable=False)
    estado: Mapped[str] = mapped_column(
        estado_pago_enum, nullable=False, server_default="pendiente"
    )

    boleto: Mapped["Boleto"] = relationship("Boleto", back_populates="pago")
    reembolso: Mapped[Optional["Reembolso"]] = relationship(
        "Reembolso", back_populates="pago", uselist=False
    )

    def __repr__(self) -> str:
        return (
            f"<Pago id={self.id_pago} boleto={self.id_boleto} metodo={self.metodo} "
            f"monto={self.monto_total} estado={self.estado}>"
        )


# ============================================================================
# REEMBOLSOS
# ============================================================================

class Reembolso(Base):
    """Reembolso asociado a un pago (RF-08 / política de cancelación)."""

    __tablename__ = "reembolsos"
    __table_args__ = (
        Index("fk_reembolso_pago", "id_pago"),
        Index("fk_reembolso_usuario", "id_usuario_responsable"),
    )

    id_reembolso: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_pago: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("pagos.id_pago", ondelete="RESTRICT"),
        nullable=False,
    )
    id_usuario_responsable: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("usuarios.id_usuario", ondelete="SET NULL"),
        nullable=True,
    )
    monto_reembolsado: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    motivo: Mapped[str] = mapped_column(Text, nullable=False)
    fecha_reembolso: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    pago: Mapped["Pago"] = relationship("Pago", back_populates="reembolso")

    def __repr__(self) -> str:
        return (
            f"<Reembolso id={self.id_reembolso} pago={self.id_pago} "
            f"monto={self.monto_reembolsado}>"
        )
