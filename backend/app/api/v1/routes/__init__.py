"""
Router de la versión 1 de la API.

Cada router por dominio se importa y registra aquí. Los endpoints
concretos se implementarán en los archivos de `app/api/v1/routes/`.
"""

from fastapi import APIRouter

# Importación diferida / lazy: evita ciclos de import.
from app.api.v1.routes import (
    agencies,
    auth,
    billing,
    bookings,
    claims,
    seats,
    travels,
)

api_v1_router = APIRouter()

api_v1_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_v1_router.include_router(travels.router, prefix="/travels", tags=["Travels"])
api_v1_router.include_router(seats.router, prefix="/seats", tags=["Seats"])
api_v1_router.include_router(
    agencies.router, prefix="/agencies", tags=["Agencies (B2B)"]
)
api_v1_router.include_router(claims.router, prefix="/claims", tags=["Claims"])
api_v1_router.include_router(billing.router, prefix="/billing", tags=["Billing"])
api_v1_router.include_router(
    bookings.router, prefix="/bookings", tags=["Bookings"]
)
