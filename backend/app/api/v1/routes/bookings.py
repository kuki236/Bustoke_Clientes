"""
Endpoints del proceso de compra y emisión de boletos (RF-07, RF-02).

El endpoint `POST /v1/bookings/process` consolida en una sola
transacción atómica:

- Validación de los bloqueos temporales del `token_sesion`.
- Upsert de pasajeros por `numero_documento`.
- Emisión de boletos con `codigo_qr` único, vinculados al
  `id_usuario` autenticado (o NULL si el comprador es guest).
- Registro del pago en estado 'completado'.
- Conversión de los bloqueos ('convertido').

**RF-02 (guest checkout):** la autenticación es opcional. Si el
cliente envía Bearer token, el boleto queda asociado a su cuenta.
Si no envía token, el boleto se emite como guest (id_usuario NULL)
usando el `email_contacto` del payload como identificador.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.schemas.booking_schema import (
    BookingProcessRequest,
    BookingProcessResponse,
)
from app.services.booking_service import BookingService

router = APIRouter()


def _resolve_optional_user_id(request: Request) -> Optional[int]:
    """
    Devuelve el `id_usuario` si el request trae un Bearer token válido;
    None en caso contrario (flujo guest, RF-02).
    """
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        payload = decode_token(token)
    except Exception:
        return None
    sub = payload.get("sub")
    try:
        return int(sub)
    except (TypeError, ValueError):
        return None


@router.post(
    "/process",
    response_model=BookingProcessResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Procesar compra de boletos (RF-07, RF-02 guest)",
    tags=["Bookings"],
)
async def process_booking(
    payload: BookingProcessRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> BookingProcessResponse:
    """
    Procesa el checkout completo de los asientos reservados.

    **Autenticación opcional:** si el cliente envía `Authorization:
    Bearer <jwt>`, el boleto se vincula a su `id_usuario`. Si NO
    envía token, el proceso se ejecuta como guest (RF-02): el
    `email_contacto` del payload se usa como dato de contacto y
    `id_usuario` queda NULL en la tabla `boletos`.

    Devuelve `201 CREATED` con el código de reserva, los boletos
    emitidos (cada uno con su `codigo_qr`), el resumen del pago y
    el total. Si algún asiento no tiene un bloqueo activo para el
    `token_sesion`, ya está ocupado, o no pertenece al bus del
    viaje, se devuelve `409 CONFLICT` y la transacción se revierte.
    """
    current_user_id = _resolve_optional_user_id(request)
    service = BookingService(db)
    try:
        result = service.process_booking(
            payload, id_usuario=current_user_id
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )
    return BookingProcessResponse(**result)
