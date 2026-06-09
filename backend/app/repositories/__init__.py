"""
Capa de repositorios: abstracción de acceso a datos (CRUD puro).

Cada repositorio encapsula las queries específicas de su entidad. No
contienen lógica de negocio.
"""

from app.repositories.booking_repository import BookingRepository
from app.repositories.pasajero_repository import PasajeroRepository
from app.repositories.seat_repository import SeatRepository
from app.repositories.travel_repository import TravelRepository
from app.repositories.user_repository import UserRepository

__all__ = [
    "BookingRepository",
    "PasajeroRepository",
    "SeatRepository",
    "TravelRepository",
    "UserRepository",
]
