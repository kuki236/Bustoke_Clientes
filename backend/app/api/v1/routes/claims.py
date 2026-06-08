"""
Endpoints de reclamos (RF-09, RF-10, RF-19).
"""

from fastapi import APIRouter

router = APIRouter()


@router.post("/", summary="Abrir un reclamo")
def create_claim():
    """Stub: alta de reclamo por pasajero."""
    return {"message": "TODO: implementar alta de reclamo"}


@router.get("/me", summary="Reclamos del usuario autenticado")
def list_my_claims():
    """Stub: listado de reclamos del pasajero (RF-10)."""
    return {"message": "TODO: implementar listado"}


@router.get("/{id_reclamo}", summary="Detalle + hilo de mensajes")
def get_claim(id_reclamo: int):
    """Stub: reclamo con mensajes."""
    return {"id_reclamo": id_reclamo, "message": "TODO: implementar detalle"}


@router.post("/{id_reclamo}/messages", summary="Añadir mensaje al hilo")
def add_message(id_reclamo: int):
    """Stub: agregar mensaje al reclamo."""
    return {"id_reclamo": id_reclamo, "message": "TODO: implementar mensaje"}


@router.post("/{id_reclamo}/respond", summary="Respuesta admin (RF-19)")
def respond_claim(id_reclamo: int):
    """Stub: respuesta y cambio de estado desde la agencia."""
    return {"id_reclamo": id_reclamo, "message": "TODO: implementar respuesta"}
