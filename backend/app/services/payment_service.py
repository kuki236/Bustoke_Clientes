"""
Servicio de pagos con Mercado Pago (Card Payment Brick).

Encapsula la creación de un `Payment` en la API de Mercado Pago usando
el `token` que el Brick de MP genera en el navegador del cliente. NO
almacena datos sensibles de la tarjeta (PCI): MP ya tokenizó la tarjeta
en su iframe, nosotros solo recibimos el `card_token` opaco.

Esta implementación usa la SDK oficial `mercadopago` (síncrona) apuntando
a las credenciales del `.env` (TEST-... en sandbox).
"""

import logging
from typing import Any, Dict

import mercadopago
from sqlalchemy.orm import Session

from app.core.config import settings
from app.schemas.payment_schema import (
    CardPaymentCreateRequest,
    CardPaymentCreateResponse,
    MercadoPagoPaymentRead,
)

logger = logging.getLogger(__name__)


class MercadoPagoError(Exception):
    """Error controlado al comunicarse con la API de Mercado Pago."""

    def __init__(self, message: str, status_code: int = 502, payload: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload


class PaymentService:
    """Crea y consulta `Payment` en Mercado Pago."""

    def __init__(self, db: Session | None = None) -> None:
        # La SDK no usa el `db`; lo dejamos por simetría con los otros
        # services y por si en el futuro queremos persistir la
        # referencia de MP en una tabla `pagos_mp`.
        self.db = db
        access_token = (settings.MERCADOPAGO_ACCESS_TOKEN or "").strip()
        if not access_token:
            raise MercadoPagoError(
                "MERCADOPAGO_ACCESS_TOKEN no configurado en el backend (.env).",
                status_code=500,
            )
        # SDK >=2.0 usa `MercadoPagoConfig` (no el wrapper MercadoPago).
        # En 2.3.0 ambos funcionan, pero la nueva forma es la canónica.
        self.sdk = mercadopago.SDK(access_token)

    # ------------------------------------------------------------------
    # Creación del Payment
    # ------------------------------------------------------------------

    def create_card_payment(
        self, payload: CardPaymentCreateRequest
    ) -> CardPaymentCreateResponse:
        """
        Crea un `Payment` en MP con el token emitido por el Brick.

        Devuelve un `CardPaymentCreateResponse` con el `id` y `status`
        de MP. Si `status == 'approved'`, el frontend debe llamar
        inmediatamente a `/v1/bookings/process` enviando
        `mp_payment_id=<id>` para emitir la reserva.
        """
        body: Dict[str, Any] = {
            "transaction_amount": float(payload.transaction_amount),
            "token": payload.token,
            "description": payload.description or "Compra de boletos - BUSTOKE",
            "installments": int(payload.installments),
            "payment_method_id": payload.payment_method_id,
            "external_reference": payload.external_reference,
            "payer": {
                "email": payload.payer.email,
            },
            # Forzamos auto_return off: el Brick hace el manejo de la
            # respuesta con su `onSubmit` / `onError` y nosotros no
            # usamos redirect. El statement_descriptor es lo que verá
            # el cliente en su resumen bancario.
            "statement_descriptor": "BUSTOKE",
        }
        if payload.issuer_id:
            body["issuer_id"] = payload.issuer_id
        if payload.payer.first_name:
            body["payer"]["first_name"] = payload.payer.first_name
        if payload.payer.identification_type and payload.payer.identification_number:
            body["payer"]["identification"] = {
                "type": payload.payer.identification_type,
                "number": payload.payer.identification_number,
            }

        logger.info(
            "[MP] Creando payment external_reference=%s amount=%s method=%s",
            payload.external_reference,
            payload.transaction_amount,
            payload.payment_method_id,
        )

        try:
            result = self.sdk.payment().create(body)
        except Exception as exc:  # noqa: BLE001
            logger.exception("[MP] Excepción llamando a payment().create()")
            raise MercadoPagoError(
                f"Error de comunicación con Mercado Pago: {exc}",
                status_code=502,
            ) from exc

        # La SDK de MP devuelve un dict con la forma:
        # {"status": 201|200|4xx, "response": {"id":..., "status":..., ...}}
        http_status = result.get("status") if isinstance(result, dict) else None
        response = result.get("response") if isinstance(result, dict) else None

        if http_status is None or response is None:
            logger.error("[MP] Respuesta malformada: %r", result)
            raise MercadoPagoError(
                "Mercado Pago devolvió una respuesta vacía o malformada.",
                status_code=502,
                payload=result,
            )

        if http_status not in (200, 201):
            # MP rechazó la petición (por ejemplo, tarjeta inválida).
            # Devolvemos el error al frontend SIN reventar el servidor.
            mp_status = str(response.get("status") or "rejected")
            mp_detail = (
                response.get("status_detail")
                or response.get("message")
                or "Pago rechazado por el procesador."
            )
            logger.warning(
                "[MP] Pago rechazado http=%s status=%s detail=%s",
                http_status,
                mp_status,
                mp_detail,
            )
            return CardPaymentCreateResponse(
                payment=MercadoPagoPaymentRead(
                    id=int(response.get("id") or 0),
                    status=mp_status,
                    status_detail=str(mp_detail),
                    payment_method_id=response.get("payment_method_id"),
                    payment_type_id=response.get("payment_type_id"),
                    transaction_amount=response.get("transaction_amount"),
                    external_reference=response.get("external_reference"),
                ),
                approved=False,
                message=str(mp_detail),
            )

        mp_status = str(response.get("status") or "pending")
        approved = mp_status == "approved"
        logger.info(
            "[MP] Pago creado id=%s status=%s approved=%s",
            response.get("id"),
            mp_status,
            approved,
        )
        return CardPaymentCreateResponse(
            payment=MercadoPagoPaymentRead(
                id=int(response.get("id") or 0),
                status=mp_status,
                status_detail=response.get("status_detail"),
                payment_method_id=response.get("payment_method_id"),
                payment_type_id=response.get("payment_type_id"),
                transaction_amount=response.get("transaction_amount"),
                external_reference=response.get("external_reference"),
            ),
            approved=approved,
            message=(
                "Pago aprobado por Mercado Pago."
                if approved
                else f"Pago en estado '{mp_status}'. La reserva no se emite hasta que el pago sea aprobado."
            ),
        )
