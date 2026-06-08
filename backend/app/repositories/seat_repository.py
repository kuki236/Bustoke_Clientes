"""
Repositorio de Asientos: consultas del estado actual de la matriz de
asientos de un bus asignado a un viaje (RF-05, RF-12, RF-18).

Replica la lógica de la vista SQL `vw_estado_asientos_viaje` a nivel de
ORM para mantener compatibilidad con SQLite (tests) y PostgreSQL (producción).
"""

from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import (
    Asiento,
    BloqueoTemporal,
    Boleto,
    Bus,
    Ruta,
    TarifaRuta,
    Viaje,
)


class SeatRepository:
    """Acceso a datos para `asientos`, `bloqueos_temporales` y `boletos`."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # ========================================================================
    # MAPA DE ASIENTOS DE UN VIAJE
    # ========================================================================

    def get_seat_map(self, viaje_id: int) -> Optional[dict]:
        """
        Devuelve el mapa completo de asientos del bus del viaje.

        Cada asiento incluye su `estado_interfaz` calculado en tiempo real:
        - `ocupado`: existe un `boletos.estado='activo'` para ese viaje.
        - `bloqueado`: existe un `bloqueos_temporales` con
          `estado='activo'` y `expira_at > NOW()`, o `bloqueado_manual=TRUE`.
        - `libre`: el resto.

        Retorna `None` si el viaje no existe.
        """
        viaje = self._get_viaje(viaje_id)
        if viaje is None:
            return None

        id_bus = viaje.id_bus
        id_ruta = viaje.id_ruta

        now = datetime.now(timezone.utc)

        # Subqueries: ids de asientos con boleto activo o bloqueo vigente.
        sub_boleto_ocupado = (
            select(Boleto.id_asiento)
            .where(
                Boleto.id_viaje == viaje_id,
                Boleto.estado == "activo",
            )
            .subquery()
        )
        sub_bloqueo_vigente = (
            select(BloqueoTemporal.id_asiento)
            .where(
                BloqueoTemporal.id_viaje == viaje_id,
                BloqueoTemporal.estado == "activo",
                BloqueoTemporal.expira_at > now,
            )
            .subquery()
        )

        stmt = (
            select(Asiento)
            .where(Asiento.id_bus == id_bus)
            .order_by(Asiento.piso.asc(), Asiento.fila.asc(), Asiento.coord_x.asc())
        )
        asientos: List[Asiento] = list(self.db.scalars(stmt).all())

        ocupados = {
            row[0]
            for row in self.db.execute(
                select(sub_boleto_ocupado.c.id_asiento)
            ).all()
        }
        bloqueados_vigentes = {
            row[0]
            for row in self.db.execute(
                select(sub_bloqueo_vigente.c.id_asiento)
            ).all()
        }

        # Tarifas por tipo_servicio para esta ruta.
        tarifas_stmt = select(TarifaRuta).where(TarifaRuta.id_ruta == id_ruta)
        tarifas = {t.tipo_servicio: Decimal(t.precio) for t in self.db.scalars(tarifas_stmt).all()}

        # Tarifa base de la ruta como fallback.
        ruta = self.db.get(Ruta, id_ruta)
        tarifa_base = Decimal(ruta.tarifa_base) if ruta is not None else Decimal("0")

        items = []
        for asiento in asientos:
            if asiento.id_asiento in ocupados:
                estado = "ocupado"
            elif asiento.bloqueado_manual or asiento.id_asiento in bloqueados_vigentes:
                estado = "bloqueado"
            else:
                estado = "libre"

            precio = tarifas.get(asiento.tipo_servicio, tarifa_base)

            items.append(
                {
                    "id_asiento": asiento.id_asiento,
                    "numero_asiento": asiento.numero_asiento,
                    "fila": asiento.fila,
                    "piso": asiento.piso,
                    "tipo_servicio": asiento.tipo_servicio,
                    "coord_x": asiento.coord_x,
                    "coord_y": asiento.coord_y,
                    "bloqueado_manual": asiento.bloqueado_manual,
                    "estado_interfaz": estado,
                    "precio": precio,
                }
            )

        bus = self.db.get(Bus, id_bus)

        return {
            "id_viaje": viaje_id,
            "id_bus": id_bus,
            "cantidad_pisos": bus.cantidad_pisos if bus is not None else 1,
            "asientos": items,
        }

    # ========================================================================
    # BLOQUEOS TEMPORALES (RF-05)
    # ========================================================================

    def has_active_ticket(self, id_viaje: int, id_asiento: int) -> bool:
        """Indica si ya existe un boleto activo para el par (viaje, asiento)."""
        stmt = select(Boleto.id_boleto).where(
            Boleto.id_viaje == id_viaje,
            Boleto.id_asiento == id_asiento,
            Boleto.estado == "activo",
        )
        return self.db.execute(stmt).first() is not None

    def get_active_hold(
        self,
        id_viaje: int,
        id_asiento: int,
    ) -> Optional[BloqueoTemporal]:
        """Devuelve el bloqueo vigente (no expirado) o None."""
        now = datetime.now(timezone.utc)
        stmt = (
            select(BloqueoTemporal)
            .where(
                BloqueoTemporal.id_viaje == id_viaje,
                BloqueoTemporal.id_asiento == id_asiento,
                BloqueoTemporal.estado == "activo",
                BloqueoTemporal.expira_at > now,
            )
            .order_by(BloqueoTemporal.expira_at.desc())
        )
        return self.db.scalars(stmt).first()

    def create_hold(
        self,
        id_viaje: int,
        id_asiento: int,
        token_sesion: str,
        segundos_ttl: int,
    ) -> BloqueoTemporal:
        """Crea un nuevo bloqueo temporal y refresca su expiración."""
        now = datetime.now(timezone.utc)
        expira_at = now + __import__("datetime").timedelta(seconds=segundos_ttl)

        hold = BloqueoTemporal(
            id_viaje=id_viaje,
            id_asiento=id_asiento,
            token_sesion=token_sesion,
            fecha_bloqueo=now,
            expira_at=expira_at,
            estado="activo",
        )
        self.db.add(hold)
        self.db.flush()
        return hold

    def release_hold(
        self,
        id_viaje: int,
        id_asiento: int,
        token_sesion: Optional[str] = None,
    ) -> int:
        """
        Marca como `liberado` los bloqueos activos del par (viaje, asiento).

        Si se indica `token_sesion` solo se liberan los bloqueos que coincidan.
        Retorna la cantidad de bloqueos liberados.
        """
        now = datetime.now(timezone.utc)
        stmt = select(BloqueoTemporal).where(
            BloqueoTemporal.id_viaje == id_viaje,
            BloqueoTemporal.id_asiento == id_asiento,
            BloqueoTemporal.estado == "activo",
            BloqueoTemporal.expira_at > now,
        )
        if token_sesion:
            stmt = stmt.where(BloqueoTemporal.token_sesion == token_sesion)

        holds = list(self.db.scalars(stmt).all())
        for hold in holds:
            hold.estado = "liberado"
        self.db.flush()
        return len(holds)

    # ========================================================================
    # HELPERS
    # ========================================================================

    def _get_viaje(self, viaje_id: int) -> Optional[Viaje]:
        stmt = (
            select(Viaje)
            .options(joinedload(Viaje.bus))
            .where(Viaje.id_viaje == viaje_id)
        )
        return self.db.scalars(stmt).unique().first()
