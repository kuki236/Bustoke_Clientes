"""
Endpoints de pagos (Mercado Pago - Card Payment Brick).

`POST /v1/payments/create` recibe el `cardFormData` que el Brick de
MercadoPago emite desde el navegador del cliente (con el `token`
opaco) y crea un `Payment` real en la API de MP. El backend NO
recibe los datos sensibles de la tarjeta (PAN, CVV, vencimiento):
el Brick los tokeniza en su iframe.

Si el pago es aprobado, el frontend debe llamar inmediatamente a
`/v1/bookings/process` enviando `mp_payment_id` para que la reserva
quede vinculada al pago real.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.payment_schema import (
    CardPaymentCreateRequest,
    CardPaymentCreateResponse,
)
from app.services.payment_service import MercadoPagoError, PaymentService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/create",
    response_model=CardPaymentCreateResponse,
    status_code=status.HTTP_200_OK,
    summary="Crear pago con tarjeta (Card Payment Brick - sandbox)",
    tags=["Payments"],
)
async def create_card_payment(
    payload: CardPaymentCreateRequest,
    db: Session = Depends(get_db),
) -> CardPaymentCreateResponse:
    """
    Crea un `Payment` en Mercado Pago con el token del Brick.

    Devuelve el `id` y `status` del pago. Si `approved=true`, el
    frontend debe llamar a `/v1/bookings/process` con el campo
    `mp_payment_id` para emitir la reserva. Si `approved=false`, se
    muestra el `message` al usuario (sin emitir reserva).
    """
    try:
        service = PaymentService(db=db)
        return service.create_card_payment(payload)
    except MercadoPagoError as exc:
        # Errores controlados (credenciales faltantes, MP caído, etc.)
        logger.error("[MP] Error controlado: %s", exc)
        raise HTTPException(
            status_code=exc.status_code,
            detail=str(exc),
        ) from exc
