"""
Repositorio de Bookings: agrupa queries transaccionales para procesar
la compra y emisión de boletos (RF-07).
"""

from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import (
    Agencia,
    Asiento,
    BloqueoTemporal,
    Boleto,
    Bus,
    Pago,
    Pasajero,
    Ruta,
    TarifaRuta,
    Viaje,
)


class BookingRepository:
    """Acceso a datos para el flujo consolidado de booking (RF-07)."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # ========================================================================
    # VIAJES / ASIENTOS
    # ========================================================================

    def get_viaje(self, id_viaje: int) -> Optional[Viaje]:
        stmt = (
            select(Viaje)
            .options(
                joinedload(Viaje.bus).joinedload(Bus.agencia),
                joinedload(Viaje.ruta).joinedload(Ruta.terminal_origen),
                joinedload(Viaje.ruta).joinedload(Ruta.terminal_destino),
                joinedload(Viaje.chofer),
            )
            .where(Viaje.id_viaje == id_viaje)
        )
        return self.db.scalars(stmt).unique().first()

    def get_asientos_for_bus(
        self, id_bus: int, id_asientos: List[int]
    ) -> List[Asiento]:
        stmt = select(Asiento).where(
            Asiento.id_bus == id_bus,
            Asiento.id_asiento.in_(id_asientos),
        )
        return list(self.db.scalars(stmt).all())

    def get_precio_for_seat(
        self, id_ruta: int, tipo_servicio: str
    ) -> Decimal:
        """Tarifa para el tipo de servicio; cae a `rutas.tarifa_base`."""
        tarifa_stmt = select(TarifaRuta).where(
            TarifaRuta.id_ruta == id_ruta,
            TarifaRuta.tipo_servicio == tipo_servicio,
        )
        tarifa = self.db.scalars(tarifa_stmt).first()
        if tarifa is not None:
            return Decimal(tarifa.precio)
        ruta = self.db.get(Ruta, id_ruta)
        if ruta is not None:
            return Decimal(ruta.tarifa_base)
        return Decimal("0")

    def has_active_ticket(self, id_viaje: int, id_asiento: int) -> bool:
        stmt = select(Boleto.id_boleto).where(
            Boleto.id_viaje == id_viaje,
            Boleto.id_asiento == id_asiento,
            Boleto.estado == "activo",
        )
        return self.db.execute(stmt).first() is not None

    def get_boletos_by_usuario(self, id_usuario: int) -> List[Boleto]:
        """
        Lista los boletos asociados a un usuario autenticado, con
        `viaje`, `asiento`, `chofer` y la cadena `viaje → ruta → terminales`
        y `viaje → bus → agencia` eager-loaded.

        Ordena por `fecha_emision DESC` (lo más reciente primero).
        Se usa como fuente de datos del endpoint
        `GET /v1/boletos/historial`.
        """
        stmt = (
            select(Boleto)
            .options(
                joinedload(Boleto.asiento),
                joinedload(Boleto.viaje).joinedload(Viaje.ruta).joinedload(
                    Ruta.terminal_origen
                ),
                joinedload(Boleto.viaje).joinedload(Viaje.ruta).joinedload(
                    Ruta.terminal_destino
                ),
                joinedload(Boleto.viaje).joinedload(Viaje.bus).joinedload(
                    Bus.agencia
                ),
                joinedload(Boleto.viaje).joinedload(Viaje.chofer),
            )
            .where(Boleto.id_usuario == id_usuario)
            .order_by(Boleto.fecha_emision.desc())
        )
        return list(self.db.scalars(stmt).unique().all())

    # ========================================================================
    # PASAJEROS
    # ========================================================================

    def get_pasajero_by_doc(self, numero_documento: str) -> Optional[Pasajero]:
        stmt = select(Pasajero).where(
            Pasajero.numero_documento == numero_documento
        )
        return self.db.scalars(stmt).first()

    def create_pasajero(self, data: dict) -> Pasajero:
        pasajero = Pasajero(**data)
        self.db.add(pasajero)
        self.db.flush()
        return pasajero

    # ========================================================================
    # BLOQUEOS TEMPORALES
    # ========================================================================

    def get_active_holds(
        self, id_viaje: int, token_sesion: str, id_asientos: List[int]
    ) -> List[BloqueoTemporal]:
        """Recupera los bloqueos vigentes que coincidan con el set de asientos."""
        now = datetime.now(timezone.utc)
        stmt = select(BloqueoTemporal).where(
            BloqueoTemporal.id_viaje == id_viaje,
            BloqueoTemporal.token_sesion == token_sesion,
            BloqueoTemporal.id_asiento.in_(id_asientos),
            BloqueoTemporal.estado == "activo",
            BloqueoTemporal.expira_at > now,
        )
        return list(self.db.scalars(stmt).all())

    def mark_holds_as_converted(self, holds: List[BloqueoTemporal]) -> None:
        for hold in holds:
            hold.estado = "convertido"
        self.db.flush()

    # ========================================================================
    # EMISIÓN DE BOLETOS Y PAGOS
    # ========================================================================

    def create_boleto(self, data: dict) -> Boleto:
        boleto = Boleto(**data)
        self.db.add(boleto)
        self.db.flush()
        return boleto

    def create_pago(self, data: dict) -> Pago:
        pago = Pago(**data)
        self.db.add(pago)
        self.db.flush()
        return pago
