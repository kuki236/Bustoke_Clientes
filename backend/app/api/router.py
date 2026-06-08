"""
Router agregador de la API.

Aquí se incluyen todas las versiones del API. Por ahora solo existe
v1; en el futuro se podrá agregar v2 sin romper compatibilidad.
"""

from fastapi import APIRouter

from app.api.v1.routes import api_v1_router

api_router = APIRouter()
api_router.include_router(api_v1_router, prefix="/v1", tags=["v1"])
