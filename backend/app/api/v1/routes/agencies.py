"""
Endpoints B2B para agencias (RF-12 a RF-21, RF-25).
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/me", summary="Datos de la agencia autenticada")
def get_my_agency():
    """Stub: perfil de la agencia B2B."""
    return {"message": "TODO: implementar perfil agencia"}


@router.get("/buses", summary="Listar flota de buses")
def list_buses():
    """Stub: buses de la agencia."""
    return {"message": "TODO: implementar listado de buses"}


@router.post("/buses", summary="Registrar un nuevo bus")
def create_bus():
    """Stub: alta de bus + plantilla de asientos."""
    return {"message": "TODO: implementar alta de bus"}


@router.get("/routes", summary="Listar rutas de la agencia")
def list_routes():
    """Stub: rutas de la agencia."""
    return {"message": "TODO: implementar listado de rutas"}


@router.post("/api-keys", summary="Generar API Key (RF-16)")
def create_api_key():
    """Stub: emisión de API Key B2B."""
    return {"message": "TODO: implementar API Key"}


@router.get("/reports", summary="Reportes operativos (RF-15)")
def get_reports():
    """Stub: reportes de la agencia."""
    return {"message": "TODO: implementar reportes"}


@router.get("/inventory", summary="Inventario B2B (RF-20)")
def get_inventory():
    """Stub: inventario para sistemas externos."""
    return {"message": "TODO: implementar inventario"}


@router.post("/inventory/lock", summary="Bloqueo B2B counter (RF-21)")
def lock_inventory():
    """Stub: bloqueo definitivo desde counter externo."""
    return {"message": "TODO: implementar lock counter"}
