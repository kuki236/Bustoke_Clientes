"""
Servicio de Asientos: orquesta las operaciones de hold/release (RF-05) y
expone la consulta del mapa de asientos de un viaje para la UI.
"""

import secrets
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.repositories.seat_repository import SeatRepository
from app.repositories.travel_repository import TravelRepository


class SeatService:
    """Lógica de negocio del módulo de asientos (RF-05, RF-12)."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.seats = SeatRepository(db)
        self.travels = TravelRepository(db)

    # ========================================================================
    # MAPA
    # ========================================================================

    def get_seat_map(self, viaje_id: int) -> Optional[dict]:
        """Devuelve el mapa de asientos del viaje o None si el viaje no existe."""
        return self.seats.get_seat_map(viaje_id)

    # ========================================================================
    # HOLD
    # ========================================================================

    def hold_seat(
        self,
        id_viaje: int,
        id_asiento: int,
        segundos_ttl: Optional[int] = None,
        token_sesion: Optional[str] = None,
    ) -> dict:
        """
        Crea (o renueva) un bloqueo temporal sobre el par (viaje, asiento).

        Lanza `ValueError` con mensajes listos para HTTPException cuando:
        - El viaje no existe.
        - El asiento no pertenece al bus del viaje.
        - El asiento ya está ocupado por un boleto activo.
        - El asiento ya tiene un bloqueo vigente (de otro origen).
        """
        viaje = self.travels.get_by_id(id_viaje)
        if viaje is None:
            raise ValueError(f"Viaje {id_viaje} no encontrado")

        # Verificamos que el asiento sea del bus del viaje.
        from sqlalchemy import select

        from app.models import Asiento

        asiento = self.db.execute(
            select(Asiento).where(
                Asiento.id_asiento == id_asiento,
                Asiento.id_bus == viaje.id_bus,
            )
        ).scalar_one_or_none()
        if asiento is None:
            raise ValueError(
                f"El asiento {id_asiento} no pertenece al bus del viaje {id_viaje}"
            )

        if asiento.bloqueado_manual:
            raise ValueError("El asiento está deshabilitado por el administrador")

        if self.seats.has_active_ticket(id_viaje, id_asiento):
            raise ValueError("El asiento ya está ocupado por un boleto activo")

        existing = self.seats.get_active_hold(id_viaje, id_asiento)
        if existing is not None:
            # Si el bloqueo existente es del mismo token, lo renovamos.
            if token_sesion and existing.token_sesion == token_sesion:
                ttl = segundos_ttl or settings.SEAT_HOLD_TTL_SECONDS
                from datetime import datetime, timedelta, timezone

                existing.expira_at = datetime.now(timezone.utc) + timedelta(seconds=ttl)
                self.db.flush()
                return self._hold_to_dict(existing, estado="activo")
            raise ValueError("El asiento ya está bloqueado por otro usuario")

        ttl = segundos_ttl or settings.SEAT_HOLD_TTL_SECONDS
        token = token_sesion or self._generate_token()
        hold = self.seats.create_hold(
            id_viaje=id_viaje,
            id_asiento=id_asiento,
            token_sesion=token,
            segundos_ttl=ttl,
        )
        return self._hold_to_dict(hold, estado="activo")

    # ========================================================================
    # RELEASE
    # ========================================================================

    def release_seat(
        self,
        id_viaje: int,
        id_asiento: int,
        token_sesion: Optional[str] = None,
        id_usuario: Optional[int] = None,
    ) -> dict:
        """
        Libera el bloqueo vigente del par (viaje, asiento).

        Tolerante: si el `release_hold` del repositorio lanza (sesión
        sucia, lock, timeout), devolvemos un resultado neutro
        (`estado='sin_bloqueo'`) en lugar de propagar la excepción al
        cliente. La capa HTTP se encarga del commit final.
        """
        try:
            count = self.seats.release_hold(
                id_viaje=id_viaje,
                id_asiento=id_asiento,
                token_sesion=token_sesion,
                id_usuario=id_usuario,
            )
        except Exception:
            return {
                "id_viaje": id_viaje,
                "id_asiento": id_asiento,
                "id_bloqueo": None,
                "expira_at": None,
                "estado": "sin_bloqueo",
            }
        return {
            "id_viaje": id_viaje,
            "id_asiento": id_asiento,
            "id_bloqueo": None,
            "expira_at": None,
            "estado": "liberado" if count > 0 else "sin_bloqueo",
        }

    # ========================================================================
    # HELPERS
    # ========================================================================

    @staticmethod
    def _generate_token() -> str:
        return secrets.token_urlsafe(24)

    @staticmethod
    def _hold_to_dict(hold, estado: str) -> dict:
        return {
            "id_viaje": hold.id_viaje,
            "id_asiento": hold.id_asiento,
            "id_bloqueo": hold.id_bloqueo,
            "expira_at": hold.expira_at.isoformat() if hold.expira_at else None,
            "estado": estado,
        }
