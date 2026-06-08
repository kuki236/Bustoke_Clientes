"""
Endpoints de bloqueo y compra de asientos (RF-05, RF-07, RF-08).

Los endpoints `/hold` y `/release` operan contra la tabla
`bloqueos_temporales` usando el TTL configurado en
`SEAT_HOLD_TTL_SECONDS` (variable de entorno).

El endpoint `/checkout` queda como stub y se completará en la fase de
pagos (RF-07).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.seat_schema import (
    SeatHoldRequest,
    SeatHoldResult,
    SeatReleaseRequest,
)
from app.services.seat_service import SeatService

router = APIRouter()


# ============================================================================
# POST /v1/seats/hold - Bloquear asiento temporalmente (RF-05)
# ============================================================================

@router.post(
    "/hold",
    response_model=SeatHoldResult,
    status_code=status.HTTP_201_CREATED,
    summary="Bloquear asiento temporalmente (RF-05)",
    tags=["Seats"],
)
async def hold_seat(
    payload: SeatHoldRequest,
    db: Session = Depends(get_db),
) -> SeatHoldResult:
    """
    Crea (o renueva) un bloqueo temporal sobre el par `(id_viaje, id_asiento)`.

    El TTL por defecto se lee de `SEAT_HOLD_TTL_SECONDS` (`.env`).
    Devuelve `409 CONFLICT` si el asiento ya tiene un boleto activo
    o un bloqueo vigente de otro origen.
    """
    service = SeatService(db)
    try:
        result = service.hold_seat(
            id_viaje=payload.id_viaje,
            id_asiento=payload.id_asiento,
            segundos_ttl=payload.segundos_ttl,
            token_sesion=payload.token_sesion,
        )
    except ValueError as exc:
        message = str(exc)
        if "no encontrado" in message.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=message,
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=message,
        )

    db.commit()
    return SeatHoldResult(**result)


# ============================================================================
# POST /v1/seats/release - Liberar bloqueo temporal
# ============================================================================

@router.post(
    "/release",
    response_model=SeatHoldResult,
    summary="Liberar bloqueo temporal (RF-05)",
    tags=["Seats"],
)
async def release_hold(
    payload: SeatReleaseRequest,
    db: Session = Depends(get_db),
) -> SeatHoldResult:
    """
    Marca como `liberado` el bloqueo vigente del par `(id_viaje, id_asiento)`.

    Si no hay bloqueo activo, devuelve `estado='sin_bloqueo'`.
    """
    service = SeatService(db)
    result = service.release_seat(
        id_viaje=payload.id_viaje,
        id_asiento=payload.id_asiento,
        token_sesion=payload.token_sesion,
    )
    db.commit()
    return SeatHoldResult(**result)


# ============================================================================
# POST /v1/seats/checkout - Stub para fase de pagos (RF-07)
# ============================================================================

@router.post(
    "/checkout",
    summary="Checkout y emisión de boleto (RF-07)",
    tags=["Seats"],
)
def checkout() -> dict:
    """Stub: cierre de compra + pago + boleto (se completará en fase de pagos)."""
    return {"message": "TODO: implementar checkout"}
