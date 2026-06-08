"""
Modelo ORM de Agencias (B2B) y tablas financieras derivadas.

Tablas cubiertas:
- agencias
- planes
- suscripciones
- configuracion_comisiones
- liquidaciones_agencia
- api_keys
- tickets_soporte
"""

from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import (
    estado_agencia_enum,
    estado_pago_enum,
    estado_ticket_enum,
)

if TYPE_CHECKING:
    from app.models.bus import Bus
    from app.models.claim import Reclamo
    from app.models.location import AgenciaTerminal, Terminal
    from app.models.route import Ruta
    from app.models.user import Usuario


# ============================================================================
# AGENCIA
# ============================================================================

class Agencia(Base):
    """
    Agencia de transporte (cliente B2B de Bustoke).

    Almacena RUC, datos bancarios para la dispersión (RF-25) y permite
    gestionar flotas, rutas, tarifas y personal administrativo.
    """

    __tablename__ = "agencias"
    __table_args__ = (
        CheckConstraint("length(ruc) = 11", name="chk_ruc_longitud"),
    )

    id_agencia: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ruc: Mapped[str] = mapped_column(String(11), unique=True, nullable=False)
    razon_social: Mapped[str] = mapped_column(String(205), nullable=False)
    estado: Mapped[str] = mapped_column(
        estado_agencia_enum, nullable=False, server_default="activa"
    )
    banco_nombre: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    numero_cuenta: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    cuenta_cci: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    buses: Mapped[List["Bus"]] = relationship("Bus", back_populates="agencia")
    rutas: Mapped[List["Ruta"]] = relationship("Ruta", back_populates="agencia")
    usuarios: Mapped[List["Usuario"]] = relationship("Usuario", back_populates="agencia")
    agencias_terminales: Mapped[List["AgenciaTerminal"]] = relationship(
        "AgenciaTerminal", back_populates="agencia", cascade="all, delete-orphan"
    )
    api_keys: Mapped[List["ApiKey"]] = relationship(
        "ApiKey", back_populates="agencia", cascade="all, delete-orphan"
    )
    reclamos: Mapped[List["Reclamo"]] = relationship("Reclamo", back_populates="agencia")
    tickets_soporte: Mapped[List["TicketSoporte"]] = relationship(
        "TicketSoporte", back_populates="agencia", cascade="all, delete-orphan"
    )
    suscripciones: Mapped[List["Suscripcion"]] = relationship(
        "Suscripcion", back_populates="agencia", cascade="all, delete-orphan"
    )
    liquidaciones: Mapped[List["LiquidacionAgencia"]] = relationship(
        "LiquidacionAgencia", back_populates="agencia", cascade="all, delete-orphan"
    )
    configuraciones_comision: Mapped[List["ConfiguracionComision"]] = relationship(
        "ConfiguracionComision",
        back_populates="agencia",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Agencia id={self.id_agencia} ruc={self.ruc} razon_social={self.razon_social!r}>"


# ============================================================================
# PLANES SAAS
# ============================================================================

class Plan(Base):
    """Plan comercial SaaS (Regular, Business) con límite de buses."""

    __tablename__ = "planes"

    id_plan: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    precio: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    limite_buses: Mapped[int] = mapped_column(Integer, nullable=False)

    suscripciones: Mapped[List["Suscripcion"]] = relationship(
        "Suscripcion", back_populates="plan"
    )

    def __repr__(self) -> str:
        return f"<Plan id={self.id_plan} nombre={self.nombre!r} precio={self.precio}>"


# ============================================================================
# SUSCRIPCIONES (facturación SaaS mensual)
# ============================================================================

class Suscripcion(Base):
    """
    Cobro mensual recurrente a una agencia por su plan SaaS (RF-24).
    """

    __tablename__ = "suscripciones"
    __table_args__ = (
        Index("fk_suscripciones_agencia", "id_agencia"),
        Index("fk_suscripciones_plan", "id_plan"),
    )

    id_suscripcion: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_agencia: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("agencias.id_agencia", ondelete="RESTRICT"),
        nullable=False,
    )
    id_plan: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("planes.id_plan", ondelete="RESTRICT"),
        nullable=False,
    )
    monto_mensual: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    fecha_facturacion: Mapped[date] = mapped_column(Date, nullable=False)
    estado_cobro: Mapped[str] = mapped_column(
        estado_pago_enum, nullable=False, server_default="pendiente"
    )

    agencia: Mapped["Agencia"] = relationship("Agencia", back_populates="suscripciones")
    plan: Mapped["Plan"] = relationship("Plan", back_populates="suscripciones")

    def __repr__(self) -> str:
        return (
            f"<Suscripcion id={self.id_suscripcion} agencia={self.id_agencia} "
            f"plan={self.id_plan} estado={self.estado_cobro}>"
        )


# ============================================================================
# COMISIONES DE PLATAFORMA
# ============================================================================

class ConfiguracionComision(Base):
    """
    Configuración de comisión (porcentaje + monto fijo) cobradas por
    Bustoke por cada pasaje vendido. Puede ser global (id_agencia NULL)
    o específica por agencia (RF-22).
    """

    __tablename__ = "configuracion_comisiones"
    __table_args__ = (
        Index(
            "idx_comisiones_vigencia",
            "id_agencia",
            "fecha_inicio",
            "fecha_fin",
        ),
        Index("fk_comisiones_agencia", "id_agencia"),
    )

    id_configuracion: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    id_agencia: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("agencias.id_agencia", ondelete="CASCADE"),
        nullable=True,
    )
    porcentaje_comision: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, server_default="0.00"
    )
    monto_fijo_comision: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, server_default="0.00"
    )
    fecha_inicio: Mapped[date] = mapped_column(
        Date, nullable=False, server_default=func.current_date()
    )
    fecha_fin: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    agencia: Mapped[Optional["Agencia"]] = relationship(
        "Agencia", back_populates="configuraciones_comision"
    )

    def __repr__(self) -> str:
        return (
            f"<ConfiguracionComision id={self.id_configuracion} "
            f"agencia={self.id_agencia} porcentaje={self.porcentaje_comision}>"
        )


# ============================================================================
# LIQUIDACIONES / DISPERSIÓN
# ============================================================================

class LiquidacionAgencia(Base):
    """
    Liquidación periódica (mensual) a transferir a la agencia (RF-25).
    El trigger `fn_calcular_comision_liquidacion` calcula automáticamente
    `comision_plataforma` y `monto_a_transferir` en INSERT/UPDATE.
    """

    __tablename__ = "liquidaciones_agencia"
    __table_args__ = (
        Index("fk_liquidaciones_agencia", "id_agencia"),
    )

    id_liquidacion_agencia: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    id_agencia: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("agencias.id_agencia", ondelete="RESTRICT"),
        nullable=False,
    )
    periodo: Mapped[str] = mapped_column(String(7), nullable=False)  # 'YYYY-MM'
    monto_ventas: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    comision_plataforma: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    monto_a_transferir: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    estado_pago: Mapped[str] = mapped_column(
        estado_pago_enum, nullable=False, server_default="pendiente"
    )

    agencia: Mapped["Agencia"] = relationship("Agencia", back_populates="liquidaciones")

    def __repr__(self) -> str:
        return (
            f"<LiquidacionAgencia id={self.id_liquidacion_agencia} "
            f"agencia={self.id_agencia} periodo={self.periodo}>"
        )


# ============================================================================
# API KEYS (RF-16)
# ============================================================================

class ApiKey(Base):
    """Token de larga duración para integraciones B2B externas (RF-16)."""

    __tablename__ = "api_keys"
    __table_args__ = (
        Index("fk_apikeys_agencia", "id_agencia"),
    )

    id_api_key: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_agencia: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("agencias.id_agencia", ondelete="CASCADE"),
        nullable=False,
    )
    token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    fecha_expiracion: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ultimo_uso: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    estado: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    agencia: Mapped["Agencia"] = relationship("Agencia", back_populates="api_keys")

    def __repr__(self) -> str:
        return f"<ApiKey id={self.id_api_key} agencia={self.id_agencia} activa={self.estado}>"


# ============================================================================
# TICKETS DE SOPORTE (B2B)
# ============================================================================

class TicketSoporte(Base):
    """Tickets de soporte B2B abiertos por una agencia hacia Bustoke."""

    __tablename__ = "tickets_soporte"
    __table_args__ = (
        Index("fk_tickets_agencia", "id_agencia"),
    )

    id_ticket_soporte: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    id_agencia: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("agencias.id_agencia", ondelete="CASCADE"),
        nullable=False,
    )
    asunto: Mapped[str] = mapped_column(String(150), nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    estado: Mapped[str] = mapped_column(
        estado_ticket_enum, nullable=False, server_default="abierto"
    )
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    agencia: Mapped["Agencia"] = relationship("Agencia", back_populates="tickets_soporte")

    def __repr__(self) -> str:
        return f"<TicketSoporte id={self.id_ticket_soporte} agencia={self.id_agencia} estado={self.estado}>"
