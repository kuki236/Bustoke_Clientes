"""
Endpoints de plataforma central: comisiones, suscripciones, liquidaciones
(RF-22 a RF-25).
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/commissions", summary="Comisiones configuradas (RF-22)")
def list_commissions():
    """Stub: configuración de comisiones por agencia."""
    return {"message": "TODO: implementar listado de comisiones"}


@router.post("/commissions", summary="Crear / actualizar comisión")
def upsert_commission():
    """Stub: upsert de comisión."""
    return {"message": "TODO: implementar upsert"}


@router.get("/subscriptions", summary="Suscripciones SaaS (RF-24)")
def list_subscriptions():
    """Stub: suscripciones vigentes."""
    return {"message": "TODO: implementar suscripciones"}


@router.get("/settlements", summary="Liquidaciones a transferir (RF-25)")
def list_settlements():
    """Stub: liquidaciones pendientes de pago a agencias."""
    return {"message": "TODO: implementar liquidaciones"}


@router.post("/settlements", summary="Generar liquidación del periodo")
def create_settlement():
    """Stub: cálculo de comisión + monto a transferir."""
    return {"message": "TODO: implementar generación de liquidación"}
