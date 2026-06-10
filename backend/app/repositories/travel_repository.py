"""
Repositorio de Viajes: queries avanzadas con JOINs a `rutas`, `terminales`,
`distritos` y `provincias` para soportar los flujos de búsqueda (RF-03, RF-04)
y el cálculo de cupos en tiempo real (RF-05).

Soporta filtros dinámicos opcionales:
- Rango de precio (`tarifas_ruta.precio`)
- Lista de agencias (`Ruta.id_agencia`)
- Tipo de servicio con verificación de asientos libres
- Turno (mañana/tarde/noche) por hora de salida
- Resolución del terminal al ámbito de la ciudad (provincia)
"""

from datetime import date, datetime, timezone
from typing import Iterable, List, Optional, Sequence

from sqlalchemy import Integer, String, cast, func, select
from sqlalchemy.orm import Session, joinedload

from app.models import (
    Asiento,
    BloqueoTemporal,
    Boleto,
    Bus,
    Distrito,
    Ruta,
    TarifaRuta,
    Terminal,
    Viaje,
)


def _coerce_agencias(
    agencias: Optional[Sequence[int] | str],
    id_agencia: Optional[int],
) -> List[int]:
    """Normaliza la lista de agencias desde sus múltiples formatos posibles."""
    if agencias is None and id_agencia is None:
        return []
    result: List[int] = []
    if isinstance(agencias, str):
        for chunk in agencias.split(","):
            chunk = chunk.strip()
            if not chunk:
                continue
            try:
                result.append(int(chunk))
            except ValueError:
                continue
    elif isinstance(agencias, Iterable):
        for value in agencias:
            try:
                result.append(int(value))
            except (TypeError, ValueError):
                continue
    if id_agencia is not None:
        result.append(int(id_agencia))
    # Deduplica manteniendo orden
    seen: set[int] = set()
    unique: List[int] = []
    for value in result:
        if value > 0 and value not in seen:
            seen.add(value)
            unique.append(value)
    return unique


class TravelRepository:
    """Acceso a datos para `Viaje` y sus agregaciones."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # ========================================================================
    # BÚSQUEDA (RF-03, RF-04)
    # ========================================================================

    def _resolve_terminal_ids_in_city(self, id_terminal: int) -> List[int]:
        """
        Devuelve los `id_terminal` que pertenecen a la misma ciudad
        (provincia) que el terminal recibido.

        Si el terminal no tiene un `distrito`/`provincia` registrado
        (caso de tests con datos mínimos), devuelve únicamente
        `[id_terminal]` para no romper la búsqueda.
        """
        provincia_subq = (
            select(Distrito.id_provincia)
            .join(Terminal, Terminal.id_distrito == Distrito.id_distrito)
            .where(Terminal.id_terminal == id_terminal)
        )
        provincia_id = self.db.execute(provincia_subq).scalar_one_or_none()
        if provincia_id is None:
            return [id_terminal]

        stmt = (
            select(Terminal.id_terminal)
            .join(Distrito, Terminal.id_distrito == Distrito.id_distrito)
            .where(Distrito.id_provincia == provincia_id)
        )
        ids = [row[0] for row in self.db.execute(stmt).all()]
        if not ids:
            return [id_terminal]
        return ids

    def search(
        self,
        id_terminal_origen: int,
        id_terminal_destino: int,
        fecha_salida: date,
        id_agencia: Optional[int] = None,
        agencias: Optional[Sequence[int] | str] = None,
        precio_min: Optional[float] = None,
        precio_max: Optional[float] = None,
        tipo_servicio: Optional[str] = None,
        turno: Optional[str] = None,
    ) -> List[Viaje]:
        """
        Devuelve los viajes `programados` que coincidan con los filtros.

        La búsqueda opera a nivel de **ciudad**: el terminal recibido se
        expande al conjunto de terminales que comparten la misma provincia
        (ej. "Lima" -> Plaza Norte + Javier Prado + La Victoria).

        Filtros opcionales aplicados en SQL (no en cliente):
        - `id_agencia` / `agencias`: por agencia(s) (`Ruta.id_agencia IN (...)`).
        - `precio_min` / `precio_max`: por `tarifas_ruta.precio BETWEEN`.
        - `tipo_servicio`: viajes con asientos libres de la categoría.
        - `turno`: por hora local de `fecha_hora_salida`.
        """
        terminales_origen = self._resolve_terminal_ids_in_city(id_terminal_origen)
        terminales_destino = self._resolve_terminal_ids_in_city(id_terminal_destino)

        stmt = (
            select(Viaje)
            .join(Ruta, Viaje.id_ruta == Ruta.id_ruta)
            .options(
                joinedload(Viaje.ruta).joinedload(Ruta.terminal_origen),
                joinedload(Viaje.ruta).joinedload(Ruta.terminal_destino),
            )
            .where(
                Ruta.id_terminal_origen.in_(terminales_origen),
                Ruta.id_terminal_destino.in_(terminales_destino),
                func.date(Viaje.fecha_hora_salida) == fecha_salida,
                Viaje.estado == "programado",
            )
        )

        agencias_lista = _coerce_agencias(agencias, id_agencia)
        if agencias_lista:
            stmt = stmt.where(Ruta.id_agencia.in_(agencias_lista))

        # --- Precio: existe una tarifa en `tarifas_ruta` dentro del rango ---
        if precio_min is not None or precio_max is not None:
            condiciones_tarifa = []
            if precio_min is not None:
                condiciones_tarifa.append(TarifaRuta.precio >= precio_min)
            if precio_max is not None:
                condiciones_tarifa.append(TarifaRuta.precio <= precio_max)
            sub_tarifa = select(TarifaRuta.id_ruta).where(*condiciones_tarifa)
            stmt = stmt.where(Ruta.id_ruta.in_(sub_tarifa))

        # --- Turno: por hora de `fecha_hora_salida` ---
        if turno:
            turno_norm = turno.strip().lower()
            hora_salida = self._hour_expression(Viaje.fecha_hora_salida)
            if turno_norm == "manana":
                stmt = stmt.where(hora_salida < 12)
            elif turno_norm == "tarde":
                stmt = stmt.where(hora_salida >= 12, hora_salida < 19)
            elif turno_norm == "noche":
                stmt = stmt.where(hora_salida >= 19)

        # --- Tipo de servicio: viajes con asientos libres de esa categoría ---
        if tipo_servicio:
            tipo_norm = tipo_servicio.strip().lower()
            buses_subq = self._buses_with_free_seat_of_type(tipo_norm)
            if buses_subq is not None:
                stmt = stmt.where(Viaje.id_bus.in_(buses_subq))

        stmt = stmt.order_by(Viaje.fecha_hora_salida.asc())
        return list(self.db.scalars(stmt).unique().all())

    def _hour_expression(self, column):
        """
        Devuelve una expresión SQL portable que extrae la hora (0-23) de
        una columna `TIMESTAMP`/`DateTime`. Compatible con PostgreSQL
        (`EXTRACT`) y SQLite (`strftime`).
        """
        bind = self.db.get_bind()
        if bind is not None and bind.dialect.name == "sqlite":
            return cast(func.strftime("%H", column), Integer)
        return func.extract("hour", column)

    def _buses_with_free_seat_of_type(self, tipo_servicio: str):
        """
        Subquery: `id_bus` cuyos buses tienen AL MENOS UN asiento libre
        del `tipo_servicio` indicado.

        Replica las reglas de `count_free_seats`: bloqueado_manual=FALSE,
        sin boleto activo, sin bloqueo temporal vigente.
        """
        if tipo_servicio not in {"vip", "normal"}:
            return None
        now = datetime.now(timezone.utc)

        sub_boleto_ocupado = (
            select(Boleto.id_asiento)
            .where(Boleto.estado == "activo")
            .subquery()
        )
        sub_bloqueo_vigente = (
            select(BloqueoTemporal.id_asiento)
            .where(
                BloqueoTemporal.estado == "activo",
                BloqueoTemporal.expira_at > now,
            )
            .subquery()
        )

        stmt = (
            select(Bus.id_bus)
            .join(Asiento, Asiento.id_bus == Bus.id_bus)
            .where(
                Asiento.tipo_servicio == tipo_servicio,
                Asiento.bloqueado_manual.is_(False),
                Asiento.id_asiento.notin_(select(sub_boleto_ocupado.c.id_asiento)),
                Asiento.id_asiento.notin_(select(sub_bloqueo_vigente.c.id_asiento)),
            )
            .distinct()
        )
        return stmt

    def get_by_id(self, viaje_id: int) -> Optional[Viaje]:
        """Recupera un viaje por PK con sus relaciones hidratadas."""
        stmt = (
            select(Viaje)
            .options(
                joinedload(Viaje.ruta).joinedload(Ruta.terminal_origen),
                joinedload(Viaje.ruta).joinedload(Ruta.terminal_destino),
                joinedload(Viaje.bus),
            )
            .where(Viaje.id_viaje == viaje_id)
        )
        return self.db.scalars(stmt).unique().first()

    # ========================================================================
    # CÁLCULO DE CUPOS EN TIEMPO REAL (RF-05)
    # ========================================================================

    def count_free_seats(self, viaje_id: int, id_bus: int) -> int:
        """
        Cuenta asientos `libres` de un viaje.

        Un asiento está libre cuando:
        - Pertenece al bus del viaje (`id_bus`).
        - NO está marcado con `bloqueado_manual = TRUE` (RF-18).
        - NO tiene un `boleto` activo para ese viaje.
        - NO tiene un `bloqueo_temporal` vigente (`estado='activo'` y
          `expira_at > NOW()`).
        """
        now = datetime.now(timezone.utc)

        # Subquery: asientos con boleto activo
        sub_boleto_ocupado = (
            select(Boleto.id_asiento)
            .where(Boleto.id_viaje == viaje_id, Boleto.estado == "activo")
            .subquery()
        )

        # Subquery: asientos con bloqueo temporal vigente
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
            select(func.count(Asiento.id_asiento))
            .where(
                Asiento.id_bus == id_bus,
                Asiento.bloqueado_manual.is_(False),
                Asiento.id_asiento.notin_(select(sub_boleto_ocupado.c.id_asiento)),
                Asiento.id_asiento.notin_(select(sub_bloqueo_vigente.c.id_asiento)),
            )
        )
        return int(self.db.execute(stmt).scalar_one() or 0)

    def count_total_seats(self, id_bus: int) -> int:
        """Cuenta el total de asientos físicos de un bus."""
        stmt = select(func.count(Asiento.id_asiento)).where(Asiento.id_bus == id_bus)
        return int(self.db.execute(stmt).scalar_one() or 0)

    def list_tipos_asiento_by_bus(self, id_bus: int) -> List[str]:
        """
        Devuelve los `tipo_servicio` (normal / vip) **distintos** que
        ofrecen los asientos físicos del bus indicado.

        Se normaliza a minúsculas y se preserva un orden estable
        (alfabético) para que el payload del endpoint `GET /v1/travels/search`
        sea determinista y fácil de consumir desde el frontend.

        Si el bus no tiene asientos registrados, devuelve una lista
        vacía (no rompe la respuesta).
        """
        tipo_servicio_text = cast(Asiento.tipo_servicio, String)
        stmt = (
            select(func.lower(tipo_servicio_text).label("tipo_servicio"))
            .where(Asiento.id_bus == id_bus)
            .distinct()
            .order_by("tipo_servicio")
        )
        return [row[0] for row in self.db.execute(stmt).all() if row[0]]
