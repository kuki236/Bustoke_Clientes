"""
Schemas para la integración con Mercado Pago (Card Payment Brick).

El frontend renderiza el Brick de MP, recopila los datos sensibles de
la tarjeta y los convierte en un `token` opaco. Esos datos llegan al
backend y se reenvían al SDK de Mercado Pago para crear el `Payment`
real. La respuesta de MP (id, status, status_detail) se persiste como
referencia de la transacción.
"""

from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class CardFormPayerSchema(BaseModel):
    """Datos del pagador devueltos por el Card Payment Brick."""

    email: EmailStr
    first_name: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Nombre del titular de la tarjeta (cardholderName del Brick).",
    )
    identification_type: Optional[str] = Field(
        default=None,
        description="Tipo de documento del titular (DNI, CE, Pasaporte, etc.)",
    )
    identification_number: Optional[str] = Field(
        default=None,
        description="Número de documento del titular (solo dígitos/letras, sin puntos).",
    )

    @field_validator("identification_type")
    @classmethod
    def _norm_id_type(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        v = str(value).strip()
        if not v:
            return None
        return v.upper()


class CardPaymentCreateRequest(BaseModel):
    """
    Payload que envía el Brick de MP en su `onSubmit`.

    `transaction_amount` es la cantidad total a cobrar (debe coincidir
    con la suma de los boletos del viaje). El backend valida que el
    `token` no esté vacío y que `payment_method_id` esté presente.

    `external_reference` se compone como
    `BOOKING:<id_viaje>:<token_sesion>:<cantidad_pasajeros>` para que
    el webhook de MP (o un GET posterior) permita reconciliar el pago
    con la reserva de asientos.
    """

    token: str = Field(..., min_length=1, max_length=255)
    payment_method_id: str = Field(..., min_length=1, max_length=50)
    issuer_id: Optional[str] = Field(default=None, max_length=50)
    installments: int = Field(default=1, ge=1, le=48)
    transaction_amount: Decimal = Field(..., gt=0, decimal_places=2, max_digits=10)
    payer: CardFormPayerSchema
    external_reference: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(
        default=None,
        max_length=200,
        description="Descripción que verá el cliente en su resumen bancario.",
    )


class MercadoPagoPaymentRead(BaseModel):
    """Datos del Payment creado en Mercado Pago."""

    id: int = Field(..., description="Payment ID de Mercado Pago")
    status: str = Field(..., description="approved | pending | rejected | ...")
    status_detail: Optional[str] = None
    payment_method_id: Optional[str] = None
    payment_type_id: Optional[str] = None
    transaction_amount: Optional[Decimal] = None
    external_reference: Optional[str] = None


class CardPaymentCreateResponse(BaseModel):
    """
    Respuesta del endpoint que el frontend debe leer antes de emitir
    la reserva. Si `status != approved`, no se llama a
    `/v1/bookings/process` y se muestra el error al usuario.
    """

    payment: MercadoPagoPaymentRead
    approved: bool
    message: str
