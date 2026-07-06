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

PERFORMANCE:
- `search_with_aggregates()` hace UNA sola query con LEFT JOINs a
  `boletos` y `bloqueos_temporales` + GROUP BY para calcular
  `asientos_libres` y los `tipos_asiento` por viaje. Antes se
  ejecutaban 1 + 2N queries (N = número de viajes), lo que con
  Neon (~80-150ms por round-trip) podía sumar 2-3s extras.
- `NOT IN` con subqueries reemplazado por `NOT EXISTS` (más
  eficiente y permite al planner usar índices en `boletos`
  y `bloqueos_temporales`).
"""

from datetime import date, datetime, timezone
from typing import Iterable, List, Optional, Sequence, Tuple

from sqlalchemy import Integer, String, and_, cast, exists, func, select
from sqlalchemy.orm import Session, aliased, joinedload

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

        OPTIMIZACIÓN: una sola query con self-join resuelto por subquery
        en lugar de 2 round-trips. Si el terminal no tiene distrito/
        provincia registrado (caso de tests con datos mínimos), devuelve
        únicamente `[id_terminal]` para no romper la búsqueda.
        """
        stmt = (
            select(Terminal.id_terminal)
            .join(Distrito, Terminal.id_distrito == Distrito.id_distrito)
            .where(
                Distrito.id_provincia == (
                    select(Distrito.id_provincia)
                    .join(Terminal, Terminal.id_distrito == Distrito.id_distrito)
                    .where(Terminal.id_terminal == id_terminal)
                    .scalar_subquery()
                )
            )
        )
        ids = [row[0] for row in self.db.execute(stmt).all()]
        return ids if ids else [id_terminal]

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

    def search_with_aggregates(
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
    ) -> List[dict]:
        """
        Búsqueda completa de viajes + cupos en UNA sola query (RF-03/04/05).

        Devuelve una lista de diccionarios "hidratados" con todos los
        campos que necesita `ViajeBusquedaResponse`, incluyendo
        `asientos_libres` y `tipos_asiento`. Esto reemplaza el patrón
        anterior de 1+N+N queries que con Neon (~100ms/RT) añadía
        2-3 segundos.

        Estructura del SQL generado (resumido):
            SELECT v.*, r.*, t_o.nombre, t_d.nombre,
                   COUNT(a.id_asiento) FILTER (WHERE libre) AS libres,
                   array_agg(DISTINCT a.tipo_servicio) AS tipos
            FROM viajes v
            JOIN rutas r ON ...
            LEFT JOIN asientos a
              LEFT JOIN boletos b ON ...
              LEFT JOIN bloqueos_temporales bl ON ...
            WHERE ... filtros ...
            GROUP BY v.id_viaje, r.id_ruta, t_o.id_terminal, t_d.id_terminal
            ORDER BY v.fecha_hora_salida ASC
        """
        terminales_origen = self._resolve_terminal_ids_in_city(id_terminal_origen)
        terminales_destino = self._resolve_terminal_ids_in_city(id_terminal_destino)
        now = datetime.now(timezone.utc)

        # --- Subquery: ids de buses con al menos un asiento libre
        # del tipo_servicio indicado (solo si se filtra por tipo) ---
        tipo_norm = tipo_servicio.strip().lower() if tipo_servicio else None
        buses_with_free_seat_subq = None
        if tipo_norm in {"vip", "normal"}:
            # NOT EXISTS es más rápido que NOT IN con subquery, y permite
            # al planner de Postgres usar índices en boletos/bloqueos.
            sub_boleto = (
                ~exists().where(
                    and_(
                        Boleto.id_asiento == Asiento.id_asiento,
                        Boleto.estado == "activo",
                    )
                )
            )
            sub_bloqueo = (
                ~exists().where(
                    and_(
                        BloqueoTemporal.id_asiento == Asiento.id_asiento,
                        BloqueoTemporal.estado == "activo",
                        BloqueoTemporal.expira_at > now,
                    )
                )
            )
            # Postgres ENUM no acepta lower() directamente; casteamos
            # a text para comparar en lowercase.
            stmt_buses = (
                select(Bus.id_bus)
                .join(Asiento, Asiento.id_bus == Bus.id_bus)
                .where(
                    func.lower(cast(Asiento.tipo_servicio, String)) == tipo_norm,
                    Asiento.bloqueado_manual.is_(False),
                    sub_boleto,
                    sub_bloqueo,
                )
                .distinct()
            )
            buses_with_free_seat_subq = stmt_buses

        # --- Query principal con agregaciones ---
        # libres = COUNT(asientos del bus que NO están ocupados ni bloqueados)
        libres_expr = func.count(Asiento.id_asiento).filter(
            Asiento.bloqueado_manual.is_(False),
            ~exists().where(
                and_(
                    Boleto.id_asiento == Asiento.id_asiento,
                    Boleto.id_viaje == Viaje.id_viaje,
                    Boleto.estado == "activo",
                )
            ),
            ~exists().where(
                and_(
                    BloqueoTemporal.id_asiento == Asiento.id_asiento,
                    BloqueoTemporal.id_viaje == Viaje.id_viaje,
                    BloqueoTemporal.estado == "activo",
                    BloqueoTemporal.expira_at > now,
                )
            ),
        ).label("asientos_libres")

        # tipos_asiento = array agregado de los tipos de servicio
        # distintos de los asientos del bus. En Postgres usamos
        # array_agg(DISTINCT ... ORDER BY ...); en SQLite usamos
        # GROUP_CONCAT(DISTINCT ...). Hay que castear el ENUM a text
        # antes de aplicar lower() (Postgres ENUM no acepta lower()).
        bind = self.db.get_bind()
        is_pg = bind is not None and bind.dialect.name == "postgresql"
        tipo_text = cast(Asiento.tipo_servicio, String)
        if is_pg:
            tipos_expr = func.array_agg(
                func.distinct(func.lower(tipo_text))
            ).label("tipos_asiento")
        else:
            tipos_expr = func.group_concat(
                func.distinct(func.lower(tipo_text))
            ).label("tipos_asiento")

        stmt = (
            select(
                Viaje.id_viaje,
                Viaje.id_ruta,
                Viaje.id_bus,
                Viaje.fecha_hora_salida,
                Viaje.fecha_hora_llegada,
                Viaje.estado,
                Viaje.rampa_embarque,
                Ruta.id_agencia,
                Ruta.tarifa_base,
                Terminal.id_terminal.label("id_terminal_origen"),
                Terminal.nombre.label("terminal_origen_nombre"),
            )
            .join(Ruta, Viaje.id_ruta == Ruta.id_ruta)
            .join(Terminal, Terminal.id_terminal == Ruta.id_terminal_origen)
            .where(
                Ruta.id_terminal_origen.in_(terminales_origen),
                Ruta.id_terminal_destino.in_(terminales_destino),
                func.date(Viaje.fecha_hora_salida) == fecha_salida,
                Viaje.estado == "programado",
            )
        )

        # Filtro: agencias
        agencias_lista = _coerce_agencias(agencias, id_agencia)
        if agencias_lista:
            stmt = stmt.where(Ruta.id_agencia.in_(agencias_lista))

        # Filtro: precio (subquery a tarifas_ruta)
        if precio_min is not None or precio_max is not None:
            condiciones_tarifa = []
            if precio_min is not None:
                condiciones_tarifa.append(TarifaRuta.precio >= precio_min)
            if precio_max is not None:
                condiciones_tarifa.append(TarifaRuta.precio <= precio_max)
            sub_tarifa = select(TarifaRuta.id_ruta).where(*condiciones_tarifa)
            stmt = stmt.where(Ruta.id_ruta.in_(sub_tarifa))

        # Filtro: turno
        if turno:
            turno_norm = turno.strip().lower()
            hora_salida = self._hour_expression(Viaje.fecha_hora_salida)
            if turno_norm == "manana":
                stmt = stmt.where(hora_salida < 12)
            elif turno_norm == "tarde":
                stmt = stmt.where(hora_salida >= 12, hora_salida < 19)
            elif turno_norm == "noche":
                stmt = stmt.where(hora_salida >= 19)

        # Filtro: tipo de servicio (buses con asiento libre de ese tipo)
        if buses_with_free_seat_subq is not None:
            stmt = stmt.where(Viaje.id_bus.in_(buses_with_free_seat_subq))

        # --- LEFT JOINs para calcular cupos y tipos en la misma query ---
        # Usamos un alias de Terminal para el destino, y joins a
        # asientos/boletos/bloqueos solo para las agregaciones.
        TerminalDest = aliased(Terminal)
        stmt = stmt.join(
            TerminalDest, TerminalDest.id_terminal == Ruta.id_terminal_destino
        ).outerjoin(
            Asiento, Asiento.id_bus == Viaje.id_bus
        )

        # Necesitamos los nombres de los terminales en la respuesta.
        # Usamos una subquery correlated para traer el nombre del destino
        # sin agregar otra JOIN compleja. O lo agregamos al SELECT.
        # Por simplicidad, hacemos un JOIN extra con un alias solo para
        # la columna terminal_destino.nombre.
        TerminalOrigenAlias = aliased(Terminal, name="t_o")
        TerminalDestinoAlias = aliased(Terminal, name="t_d")
        stmt = stmt.add_columns(
            TerminalDestinoAlias.nombre.label("terminal_destino_nombre"),
            libres_expr,
            tipos_expr,
        )

        # Reemplazamos los JOINs por los alias explícitos para nombres
        # (esto se hace en una segunda query ligera, ver más abajo).
        # Para mantener simple el SQL, hacemos un único join con Terminal
        # twice via aliases en lugar del join simple que ya tenemos.
        # Reescribimos:
        stmt = (
            select(
                Viaje.id_viaje,
                Viaje.id_ruta,
                Viaje.id_bus,
                Viaje.fecha_hora_salida,
                Viaje.fecha_hora_llegada,
                Viaje.estado,
                Viaje.rampa_embarque,
                Ruta.id_agencia,
                Ruta.tarifa_base,
                TerminalOrigenAlias.nombre.label("terminal_origen_nombre"),
                TerminalDestinoAlias.nombre.label("terminal_destino_nombre"),
                libres_expr,
                tipos_expr,
            )
            .join(Ruta, Viaje.id_ruta == Ruta.id_ruta)
            .join(
                TerminalOrigenAlias,
                TerminalOrigenAlias.id_terminal == Ruta.id_terminal_origen,
            )
            .join(
                TerminalDestinoAlias,
                TerminalDestinoAlias.id_terminal == Ruta.id_terminal_destino,
            )
            .outerjoin(Asiento, Asiento.id_bus == Viaje.id_bus)
            .where(
                Ruta.id_terminal_origen.in_(terminales_origen),
                Ruta.id_terminal_destino.in_(terminales_destino),
                func.date(Viaje.fecha_hora_salida) == fecha_salida,
                Viaje.estado == "programado",
            )
            .group_by(
                Viaje.id_viaje,
                Ruta.id_ruta,
                TerminalOrigenAlias.nombre,
                TerminalDestinoAlias.nombre,
            )
            .order_by(Viaje.fecha_hora_salida.asc())
        )

        # Reaplicamos los filtros sobre el stmt final
        if agencias_lista:
            stmt = stmt.where(Ruta.id_agencia.in_(agencias_lista))
        if precio_min is not None or precio_max is not None:
            condiciones_tarifa = []
            if precio_min is not None:
                condiciones_tarifa.append(TarifaRuta.precio >= precio_min)
            if precio_max is not None:
                condiciones_tarifa.append(TarifaRuta.precio <= precio_max)
            sub_tarifa = select(TarifaRuta.id_ruta).where(*condiciones_tarifa)
            stmt = stmt.where(Ruta.id_ruta.in_(sub_tarifa))
        if turno:
            turno_norm = turno.strip().lower()
            hora_salida = self._hour_expression(Viaje.fecha_hora_salida)
            if turno_norm == "manana":
                stmt = stmt.where(hora_salida < 12)
            elif turno_norm == "tarde":
                stmt = stmt.where(hora_salida >= 12, hora_salida < 19)
            elif turno_norm == "noche":
                stmt = stmt.where(hora_salida >= 19)
        if buses_with_free_seat_subq is not None:
            stmt = stmt.where(Viaje.id_bus.in_(buses_with_free_seat_subq))

        rows = self.db.execute(stmt).all()
        results: List[dict] = []
        for row in rows:
            tipos_raw = row.tipos_asiento
            if isinstance(tipos_raw, str):
                tipos_list = [t for t in tipos_raw.split(",") if t]
            elif isinstance(tipos_raw, (list, tuple)):
                tipos_list = [str(t) for t in tipos_raw if t]
            else:
                tipos_list = []
            results.append(
                {
                    "id_viaje": row.id_viaje,
                    "id_ruta": row.id_ruta,
                    "id_bus": row.id_bus,
                    "id_agencia": row.id_agencia,
                    "terminal_origen": row.terminal_origen_nombre,
                    "terminal_destino": row.terminal_destino_nombre,
                    "fecha_hora_salida": row.fecha_hora_salida,
                    "fecha_hora_llegada": row.fecha_hora_llegada,
                    "estado": row.estado,
                    "rampa_embarque": row.rampa_embarque,
                    "precio_base": row.tarifa_base,
                    "asientos_libres": int(row.asientos_libres or 0),
                    "tipos_asiento": sorted(set(tipos_list)),
                }
            )
        return results

    # ------------------------------------------------------------------
    # Métodos legacy (se mantienen para el endpoint /{id_viaje})
    # ------------------------------------------------------------------

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

    def count_free_seats(self, viaje_id: int, id_bus: int) -> int:
        """
        Cuenta asientos `libres` de un viaje (método legacy, usado solo
        en `GET /v1/travels/{id_viaje}`). En la búsqueda principal
        este conteo se hace dentro de la query agregada de
        `search_with_aggregates()`.

        OPTIMIZACIÓN: `NOT EXISTS` en lugar de `NOT IN` con subquery.
        """
        now = datetime.now(timezone.utc)

        sub_boleto_ocupado = ~exists().where(
            and_(
                Boleto.id_asiento == Asiento.id_asiento,
                Boleto.id_viaje == viaje_id,
                Boleto.estado == "activo",
            )
        )
        sub_bloqueo_vigente = ~exists().where(
            and_(
                BloqueoTemporal.id_asiento == Asiento.id_asiento,
                BloqueoTemporal.id_viaje == viaje_id,
                BloqueoTemporal.estado == "activo",
                BloqueoTemporal.expira_at > now,
            )
        )

        stmt = (
            select(func.count(Asiento.id_asiento))
            .where(
                Asiento.id_bus == id_bus,
                Asiento.bloqueado_manual.is_(False),
                sub_boleto_ocupado,
                sub_bloqueo_vigente,
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
        ofrecen los asientos físicos del bus indicado. Legacy: solo se
        usa en `GET /v1/travels/{id_viaje}`.
        """
        tipo_servicio_text = cast(Asiento.tipo_servicio, String)
        stmt = (
            select(func.lower(tipo_servicio_text).label("tipo_servicio"))
            .where(Asiento.id_bus == id_bus)
            .distinct()
            .order_by("tipo_servicio")
        )
        return [row[0] for row in self.db.execute(stmt).all() if row[0]]
