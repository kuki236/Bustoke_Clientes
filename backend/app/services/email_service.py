"""
Servicio de Email transaccional vía Resend (RF-08).

Soporta:
- Confirmación de compra con PDF adjunto
- Acuse de recibo de reclamo
- Respuesta del admin al reclamo (RF-19)

Si `RESEND_API_KEY` no está configurada, el servicio opera en modo
`disabled` y todas las llamadas devuelven `False` sin lanzar
excepciones. Esto permite que el resto del sistema siga funcionando
aunque el email no esté configurado todavía.
"""

import logging
import os
from typing import Optional

import resend

from app.services.pdf_service import generate_ticket_pdf

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Templates HTML (inline para evitar dependencia de Jinja en este módulo)
# ---------------------------------------------------------------------------

_BRAND = "#2563eb"
_BRAND_BG = "#eff6ff"
_TEXT = "#0f172a"
_MUTED = "#64748b"


def _layout(content: str) -> str:
    return f"""<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:{_TEXT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(15,23,42,0.08);">
          <tr>
            <td style="background-color:{_BRAND};padding:20px 32px;">
              <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">BUSTOKE</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              {content}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #e2e8f0;background-color:#f8fafc;">
              <p style="margin:0;font-size:12px;color:{_MUTED};text-align:center;">
                BUSTOKE © 2026 · Plataforma de venta de pasajes interprovinciales
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _render_compra_html(boleto: dict) -> str:
    body = f"""
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;">¡Compra confirmada!</h1>
      <p style="margin:0 0 24px;color:{_MUTED};font-size:14px;line-height:1.5;">
        Hola <strong>{boleto.get('nombres', '')} {boleto.get('apellido_paterno', '')}</strong>,
        tu pago fue procesado correctamente. Adjuntamos tu boleto en PDF.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:{_BRAND_BG};border:1px solid #dbeafe;border-radius:10px;padding:20px;margin-bottom:24px;">
        <tr>
          <td>
            <p style="margin:0 0 4px;font-size:12px;color:{_MUTED};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Código de reserva</p>
            <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:{_BRAND};">{boleto.get('codigo_reserva', boleto.get('codigo_qr', ''))}</p>
            <p style="margin:0 0 4px;font-size:12px;color:{_MUTED};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Ruta</p>
            <p style="margin:0 0 16px;font-size:16px;font-weight:600;">{boleto.get('origen', '')} → {boleto.get('destino', '')}</p>
            <p style="margin:0 0 4px;font-size:12px;color:{_MUTED};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Fecha y hora</p>
            <p style="margin:0;font-size:14px;">{boleto.get('fecha_hora_salida', '')}</p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 8px;font-size:14px;line-height:1.6;">
        <strong>Empresa:</strong> {boleto.get('empresa', '')}<br>
        <strong>Asiento:</strong> {boleto.get('numero_asiento', '')}<br>
        <strong>Servicio:</strong> {boleto.get('tipo_servicio', 'Normal')}<br>
        <strong>Total:</strong> S/ {boleto.get('precio_final', 0)}
      </p>

      <p style="margin:24px 0 0;font-size:13px;color:{_MUTED};line-height:1.5;">
        Presenta el PDF adjunto o el código QR en el counter de embarque.
        Guarda este correo como respaldo de tu compra.
      </p>
    """
    return _layout(body)


def _render_claim_received_html(reclamo: dict) -> str:
    body = f"""
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;">Reclamo recibido</h1>
      <p style="margin:0 0 24px;color:{_MUTED};font-size:14px;line-height:1.5;">
        Hola, hemos registrado tu reclamo con el siguiente código de seguimiento:
        <strong style="color:{_BRAND};">REC-{str(reclamo.get('id_reclamo', 0)).zfill(6)}</strong>.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:24px;">
        <tr><td>
          <p style="margin:0 0 8px;font-size:12px;color:{_MUTED};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Motivo</p>
          <p style="margin:0 0 16px;font-size:14px;font-weight:600;">{reclamo.get('motivo', '')}</p>
          <p style="margin:0 0 8px;font-size:12px;color:{_MUTED};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Detalle</p>
          <p style="margin:0;font-size:14px;line-height:1.5;white-space:pre-wrap;">{reclamo.get('detalle', '')}</p>
        </td></tr>
      </table>

      <p style="margin:0;font-size:13px;color:{_MUTED};line-height:1.5;">
        Te mantendremos informado por este medio cuando la agencia
        responda o cambie el estado del reclamo.
      </p>
    """
    return _layout(body)


def _render_claim_responded_html(reclamo: dict, respuesta: str, estado: str) -> str:
    body = f"""
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;">Tu reclamo tiene una respuesta</h1>
      <p style="margin:0 0 24px;color:{_MUTED};font-size:14px;line-height:1.5;">
        La agencia respondió a tu reclamo
        <strong style="color:{_BRAND};">REC-{str(reclamo.get('id_reclamo', 0)).zfill(6)}</strong>.
        Estado actual: <strong>{estado}</strong>.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:{_BRAND_BG};border:1px solid #dbeafe;border-radius:10px;padding:20px;margin-bottom:24px;">
        <tr><td>
          <p style="margin:0 0 8px;font-size:12px;color:{_MUTED};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Respuesta de la agencia</p>
          <p style="margin:0;font-size:14px;line-height:1.6;white-space:pre-wrap;">{respuesta}</p>
        </td></tr>
      </table>

      <p style="margin:0;font-size:13px;color:{_MUTED};line-height:1.5;">
        Si necesitas agregar más información, responde este correo o
        ingresa a Mis Reclamos en la app.
      </p>
    """
    return _layout(body)


# ---------------------------------------------------------------------------
# Servicio
# ---------------------------------------------------------------------------

class EmailService:
    """Wrapper de Resend con graceful degradation."""

    def __init__(self) -> None:
        self.api_key = os.getenv("RESEND_API_KEY", "").strip()
        self.from_email = os.getenv(
            "RESEND_FROM_EMAIL",
            "BUSTOKE <onboarding@resend.dev>",
        ).strip()
        self.enabled = bool(self.api_key)
        if self.enabled:
            resend.api_key = self.api_key
            logger.info("EmailService inicializado (Resend habilitado)")
        else:
            logger.warning(
                "EmailService en modo disabled: RESEND_API_KEY no configurada. "
                "Los emails no se enviarán hasta configurarla."
            )

    # ------------------------------------------------------------------
    # Compra / Boleto (RF-08)
    # ------------------------------------------------------------------
    def send_compra_confirmation(
        self,
        to_email: str,
        boleto: dict,
        codigo_reserva: str,
    ) -> bool:
        """
        Envía la confirmación de compra con el PDF del boleto adjunto.
        El dict `boleto` debe tener todos los campos que usa
        `generate_ticket_pdf`.
        """
        if not self.enabled:
            logger.info("send_compra_confirmation: email deshabilitado, omitido")
            return False
        if not to_email:
            logger.warning("send_compra_confirmation: to_email vacío, omitido")
            return False
        try:
            pdf_bytes = generate_ticket_pdf(
                {**boleto, "codigo_qr": boleto.get("codigo_qr", codigo_reserva)}
            )
            payload = {
                "from": self.from_email,
                "to": [to_email],
                "subject": (
                    f"Tu boleto Bustoke - "
                    f"{boleto.get('origen', '')} → {boleto.get('destino', '')}"
                ),
                "html": _render_compra_html(
                    {**boleto, "codigo_reserva": codigo_reserva}
                ),
                "attachments": [
                    {
                        "filename": f"boleto-bustoke-{codigo_reserva}.pdf",
                        "content": list(pdf_bytes),
                    }
                ],
            }
            r = resend.Emails.send(payload)
            logger.info(
                "Email de compra enviado a %s (id=%s)", to_email, r.get("id", "?")
            )
            return True
        except Exception as exc:  # noqa: BLE001
            logger.exception("Error enviando email de compra: %s", exc)
            return False

    # ------------------------------------------------------------------
    # Reclamos (RF-10, RF-19)
    # ------------------------------------------------------------------
    def send_claim_received(self, to_email: str, reclamo: dict) -> bool:
        if not self.enabled or not to_email:
            return False
        try:
            resend.Emails.send(
                {
                    "from": self.from_email,
                    "to": [to_email],
                    "subject": (
                        f"Reclamo REC-{str(reclamo.get('id_reclamo', 0)).zfill(6)} "
                        f"recibido"
                    ),
                    "html": _render_claim_received_html(reclamo),
                }
            )
            return True
        except Exception as exc:  # noqa: BLE001
            logger.exception("Error enviando acuse de reclamo: %s", exc)
            return False

    def send_claim_responded(
        self,
        to_email: str,
        reclamo: dict,
        respuesta: str,
        estado: str,
    ) -> bool:
        if not self.enabled or not to_email:
            return False
        try:
            resend.Emails.send(
                {
                    "from": self.from_email,
                    "to": [to_email],
                    "subject": (
                        f"Tu reclamo REC-{str(reclamo.get('id_reclamo', 0)).zfill(6)} "
                        f"tiene respuesta"
                    ),
                    "html": _render_claim_responded_html(
                        reclamo, respuesta, estado
                    ),
                }
            )
            return True
        except Exception as exc:  # noqa: BLE001
            logger.exception("Error enviando respuesta de reclamo: %s", exc)
            return False


# Singleton (el servicio es stateless después del __init__)
_email_service: Optional[EmailService] = None


def get_email_service() -> EmailService:
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service
