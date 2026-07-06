"""
Servicio de Viajes: implementa la búsqueda B2C (RF-03, RF-04) y el
cálculo de cupos en tiempo real (RF-05).

PERFORMANCE: la búsqueda se delega al método
`TravelRepository.search_with_aggregates()` que ejecuta UNA sola query
SQL con todas las agregaciones (asientos_libres + tipos_asiento). Antes
se hacían 1 + 2N queries (N = viajes encontrados), lo que con Neon
añadía 2-3 segundos innecesarios.
"""

from datetime import date
from typing import List, Optional, Sequence

from sqlalchemy.orm import Session

from app.repositories.travel_repository import TravelRepository
from app.schemas.travel_schema import ViajeBusquedaResponse


class TravelService:
    """Lógica de negocio para el módulo de viajes (B2C)."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.travels = TravelRepository(db)

    def search_travels(
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
    ) -> List[ViajeBusquedaResponse]:
        """
        Busca viajes disponibles para una ruta + fecha con filtros
        opcionales. Una sola query SQL agrega los asientos libres y
        los tipos de servicio por viaje.

        Args:
            id_terminal_origen: terminal de partida (se expande a la
                misma ciudad / provincia).
            id_terminal_destino: terminal de llegada (idem).
            fecha_salida: día exacto de salida.
            id_agencia: filtro opcional por agencia única (legacy).
            agencias: lista de IDs de agencia separadas por coma o
                secuencia, ej: [1, 3] o "1,3".
            precio_min: tarifa mínima (`tarifas_ruta.precio`).
            precio_max: tarifa máxima (`tarifas_ruta.precio`).
            tipo_servicio: "vip" | "normal" — requiere al menos un
                asiento libre de esa categoría.
            turno: "manana" | "tarde" | "noche" — por hora de salida.

        Returns:
            Lista de `ViajeBusquedaResponse` con `asientos_libres`.
        """
        rows = self.travels.search_with_aggregates(
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
        return [ViajeBusquedaResponse(**row) for row in rows]
