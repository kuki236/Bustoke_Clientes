"""
Endpoints del proceso de compra y emisión de boletos (RF-07).

El endpoint `POST /v1/bookings/process` consolida en una sola
transacción atómica:

- Validación de los bloqueos temporales del `token_sesion`.
- Upsert de pasajeros por `numero_documento`.
- Emisión de boletos con `codigo_qr` único.
- Registro del pago en estado 'completado'.
- Conversión de los bloqueos ('convertido').
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.booking_schema import (
    BookingProcessRequest,
    BookingProcessResponse,
)
from app.services.booking_service import BookingService

router = APIRouter()


@router.post(
    "/process",
    response_model=BookingProcessResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Procesar compra de boletos (RF-07)",
    tags=["Bookings"],
)
async def process_booking(
    payload: BookingProcessRequest,
    db: Session = Depends(get_db),
) -> BookingProcessResponse:
    """
    Procesa el checkout completo de los asientos reservados.

    Devuelve `201 CREATED` con el código de reserva, los boletos
    emitidos (cada uno con su `codigo_qr`), el resumen del pago y el
    total. Si algún asiento no tiene un bloqueo activo para el
    `token_sesion`, ya está ocupado, o no pertenece al bus del viaje,
    se devuelve `409 CONFLICT` y la transacción se revierte.
    """
    service = BookingService(db)
    try:
        result = service.process_booking(payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )
    return BookingProcessResponse(**result)
