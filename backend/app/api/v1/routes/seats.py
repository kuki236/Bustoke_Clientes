"""
Endpoints de bloqueo y compra de asientos (RF-05, RF-07, RF-08).

Los endpoints `/hold` y `/release` operan contra la tabla
`bloqueos_temporales` usando el TTL configurado en
`SEAT_HOLD_TTL_SECONDS` (variable de entorno).

El endpoint `/release-sync` es una variante tolerante a cierres abruptos
de pestaña (FIX BUG-049/050/051): recibe los holds pendientes en el
CUERPO como JSON y los libera, devolviendo siempre 200. El frontend lo
invoca vía `navigator.sendBeacon()` en `beforeunload` para no dejar
holds zombies.

El endpoint `/checkout` queda como stub y se completará en la fase de
pagos (RF-07).
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
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
            id_usuario=payload.id_usuario,
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

    Si no hay bloqueo activo (TTL expirado, ya liberado, o nunca existió),
    devuelve `estado='sin_bloqueo'` con HTTP 200 — nunca 5xx — para que el
    cliente pueda des-seleccionar sin interrumpir la experiencia.
    """
    service = SeatService(db)
    result = service.release_seat(
        id_viaje=payload.id_viaje,
        id_asiento=payload.id_asiento,
        token_sesion=payload.token_sesion,
        id_usuario=payload.id_usuario,
    )
    try:
        db.commit()
    except Exception:
# Sesión sucia: hacemos rollback y devolvemos éxito tolerante.
        db.rollback()
        return SeatHoldResult(
            id_viaje=payload.id_viaje,
            id_asiento=payload.id_asiento,
            id_bloqueo=None,
            expira_at=None,
            estado="sin_bloqueo",
        )
    return SeatHoldResult(**result)


# ============================================================================
class BeaconReleaseItem(BaseModel):
    id_viaje: int = Field(..., ge=1)
    id_asiento: int = Field(..., ge=1)
    token_sesion: str = Field(..., min_length=1, max_length=255)


class BeaconReleasePayload(BaseModel):
    items: List[BeaconReleaseItem] = Field(..., max_length=50)


@router.post(
    "/release-sync",
    summary="Liberar múltiples holds (sendBeacon / beforeunload)",
    tags=["Seats"],
)
async def release_holds_beacon(
    payload: BeaconReleasePayload,
    db: Session = Depends(get_db),
) -> dict:
    """
    FIX BUG-049/050/051: libera en batch los holds pendientes durante
    el cierre de la pestaña. Tolerante: si un hold ya expiró, ya fue
    convertido a boleto, o la BD da error transitorio, lo omitimos
    silenciosamente y devolvemos 200. El navegador puede confiar en que
    `sendBeacon` aceptó el mensaje.
    """
    service = SeatService(db)
    released = 0
    for item in payload.items:
        try:
            result = service.release_seat(
                id_viaje=item.id_viaje,
                id_asiento=item.id_asiento,
                token_sesion=item.token_sesion,
            )
            if result.get("estado") == "liberado":
                released += 1
        except Exception:
            # best-effort: nunca debe romper el cierre de la pestaña
            continue
    try:
        db.commit()
    except Exception:
        db.rollback()
    return {"ok": True, "released": released, "total": len(payload.items)}


# ============================================================================
@router.post(
    "/checkout",
    summary="Checkout y emisión de boleto (RF-07)",
    tags=["Seats"],
)
def checkout() -> dict:
    """Stub: cierre de compra + pago + boleto (se completará en fase de pagos)."""
    return {"message": "TODO: implementar checkout"}
