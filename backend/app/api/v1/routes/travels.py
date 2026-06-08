"""
Endpoints de búsqueda y consulta de viajes (RF-03, RF-04, RF-05, RF-11, RF-17).

El endpoint `/search` ejecuta la consulta real contra PostgreSQL con
JOINs a `rutas`, `terminales`, `distritos` y `provincias` (resolución
por ciudad), y aplica los filtros opcionales (precio, agencia, tipo
de servicio, turno) directamente en SQL. Calcula además en tiempo
real la cantidad de asientos libres por viaje.
"""

from datetime import date
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.seat_schema import MapaAsientosResponse
from app.schemas.travel_schema import ViajeBusquedaResponse
from app.services.seat_service import SeatService
from app.services.travel_service import TravelService

router = APIRouter()

TurnoLiteral = Literal["manana", "tarde", "noche"]
TipoServicioLiteral = Literal["vip", "normal"]


# ============================================================================
# GET /v1/travels/search - Búsqueda de viajes disponibles
# ============================================================================

@router.get(
    "/search",
    response_model=List[ViajeBusquedaResponse],
    summary="Buscar viajes disponibles por origen, destino y fecha",
    tags=["Travels"],
)
async def search_travels(
    id_terminal_origen: int = Query(..., ge=1, description="Terminal de partida"),
    id_terminal_destino: int = Query(..., ge=1, description="Terminal de llegada"),
    fecha_salida: date = Query(..., description="Fecha de salida (YYYY-MM-DD)"),
    id_agencia: Optional[int] = Query(
        None,
        ge=1,
        description="Filtro legacy por una sola agencia. Preferir `agencias`.",
    ),
    agencias: Optional[str] = Query(
        None,
        description="Lista de IDs de agencia separadas por coma, ej: '1,3'",
    ),
    precio_min: Optional[float] = Query(
        None,
        ge=0,
        description="Tarifa mínima aplicada sobre `tarifas_ruta.precio`",
    ),
    precio_max: Optional[float] = Query(
        None,
        ge=0,
        description="Tarifa máxima aplicada sobre `tarifas_ruta.precio`",
    ),
    tipo_servicio: Optional[TipoServicioLiteral] = Query(
        None,
        description="Filtra viajes con asientos libres de la categoría indicada",
    ),
    turno: Optional[TurnoLiteral] = Query(
        None,
        description="Turno de salida: manana (<12), tarde (12-18:59), noche (>=19)",
    ),
    db: Session = Depends(get_db),
) -> List[ViajeBusquedaResponse]:
    """
    Devuelve los viajes `programados` para una combinación
    (origen, destino, fecha). Cada viaje incluye el conteo en tiempo
    real de asientos libres (RF-05).

    La búsqueda se hace a nivel de **ciudad** (provincia): pasar el
    terminal de Javier Prado devuelve también los viajes que salen
    desde Plaza Norte o La Victoria.

    Filtros opcionales (todos combinados con AND, todos resueltos en SQL):
    - `agencias` / `id_agencia`: lista o ID único de agencia.
    - `precio_min` / `precio_max`: rango en `tarifas_ruta.precio`.
    - `tipo_servicio`: "vip" | "normal".
    - `turno`: "manana" | "tarde" | "noche".
    """
    if id_terminal_origen == id_terminal_destino:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El origen y el destino deben ser distintos",
        )

    if (
        precio_min is not None
        and precio_max is not None
        and precio_max < precio_min
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="precio_max debe ser mayor o igual a precio_min",
        )

    service = TravelService(db)
    return service.search_travels(
        id_terminal_origen=id_terminal_origen,
        id_terminal_destino=id_terminal_destino,
        fecha_salida=fecha_salida,
        id_agencia=id_agencia,
        agencias=agencias,
        precio_min=precio_min,
        precio_max=precio_max,
        tipo_servicio=tipo_servicio,
        turno=turno,
    )


# ============================================================================
# GET /v1/travels/{id_viaje} - Detalle de un viaje
# ============================================================================

@router.get(
    "/{id_viaje}",
    response_model=ViajeBusquedaResponse,
    summary="Detalle de un viaje con cupos en tiempo real",
    tags=["Travels"],
)
async def get_travel(
    id_viaje: int,
    db: Session = Depends(get_db),
) -> ViajeBusquedaResponse:
    """Devuelve un viaje específico con sus asientos libres."""
    from app.repositories.travel_repository import TravelRepository

    repo = TravelRepository(db)
    viaje = repo.get_by_id(id_viaje)
    if viaje is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Viaje {id_viaje} no encontrado",
        )

    libres = repo.count_free_seats(viaje_id=viaje.id_viaje, id_bus=viaje.id_bus)
    ruta = viaje.ruta
    return ViajeBusquedaResponse(
        id_viaje=viaje.id_viaje,
        id_ruta=viaje.id_ruta,
        id_bus=viaje.id_bus,
        id_agencia=ruta.id_agencia,
        terminal_origen=ruta.terminal_origen.nombre,
        terminal_destino=ruta.terminal_destino.nombre,
        fecha_hora_salida=viaje.fecha_hora_salida,
        fecha_hora_llegada=viaje.fecha_hora_llegada,
        estado=viaje.estado,
        rampa_embarque=viaje.rampa_embarque,
        precio_base=ruta.tarifa_base,
        asientos_libres=libres,
    )


# ============================================================================
# GET /v1/travels/{id_viaje}/seats - Mapa de asientos
# ============================================================================

@router.get(
    "/{id_viaje}/seats",
    response_model=MapaAsientosResponse,
    summary="Mapa de asientos de un viaje (RF-05)",
    tags=["Travels"],
)
async def get_travel_seats(
    id_viaje: int,
    db: Session = Depends(get_db),
) -> MapaAsientosResponse:
    """
    Devuelve el estado actual (`libre` / `ocupado` / `bloqueado`) de
    cada asiento del bus asignado al viaje. La respuesta se calcula en
    tiempo real cruzando `asientos`, `boletos` y `bloqueos_temporales`
    (réplica ORM de la vista `vw_estado_asientos_viaje`).
    """
    service = SeatService(db)
    seat_map = service.get_seat_map(id_viaje)
    if seat_map is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Viaje {id_viaje} no encontrado",
        )
    return MapaAsientosResponse(**seat_map)


# ============================================================================
# GET /v1/travels/{id_viaje}/manifiesto - Manifiesto SUTRAN (RF-17)
# ============================================================================

@router.get(
    "/{id_viaje}/manifiesto",
    summary="Manifiesto oficial SUTRAN (RF-17)",
    tags=["Travels"],
)
async def get_manifiesto(
    id_viaje: int,
    db: Session = Depends(get_db),
) -> dict:
    """Stub: lista oficial de pasajeros para SUTRAN."""
    from app.repositories.travel_repository import TravelRepository

    repo = TravelRepository(db)
    if repo.get_by_id(id_viaje) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Viaje {id_viaje} no encontrado",
        )

    return {
        "id_viaje": id_viaje,
        "message": "TODO: implementar compilación de manifiesto SUTRAN",
    }
