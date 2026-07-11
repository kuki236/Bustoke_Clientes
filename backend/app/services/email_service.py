"""
Servicio de Email transaccional vía SMTP (RF-08).

Si `SMTP_HOST` está configurado, envía emails usando SMTP genérico
(Gmail, Mailtrap, SendGrid SMTP, etc.). Si no está configurado,
opera en modo `disabled` y los métodos devuelven `False` sin
lanzar excepciones (graceful degradation, no rompe el flujo de
compra/reclamo).

**Para Gmail SMTP (sin dominio propio):**
- Activá 2FA en tu cuenta Google
- Generá App Password en https://myaccount.google.com/apppasswords
- Configurá `SMTP_USER` con tu email y `SMTP_PASSWORD` con el
  App Password de 16 caracteres.

FIX BUG-076/XBUG-017-020: todos los valores que vienen del usuario
(`nombres`, `apellido_paterno`, `motivo`, `detalle`, `text_mensaje`,
`origen`, `destino`, etc.) se pasan por `_safe_text()` antes de
insertarlos en el HTML. Esto previene inyecciones de `<script>` o
HTML malicioso a través de campos de texto (XSS persistente en el
email que recibe el comprador y se renderiza en su cliente de correo).
"""

import html
import logging
import os
import smtplib
from email.message import EmailMessage
from typing import Optional

from app.services.pdf_service import generate_ticket_pdf

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Util: escape HTML para prevenir XSS en emails renderizados
# ---------------------------------------------------------------------------

def _safe_text(value, fallback: str = "") -> str:
    """
    FIX BUG-076/XBUG-017-020: escapa HTML en cualquier string que vaya
    a insertarse en el template del email. Convierte `<script>` en
    `&lt;script&gt;` para que el cliente de email lo muestre como
    texto literal en lugar de ejecutarlo.

    Si el valor es None, devuelve el fallback. Cualquier objeto se
    convierte a `str` antes de escapar.
    """
    if value is None:
        return fallback
    return html.escape(str(value), quote=True)


# ---------------------------------------------------------------------------
# Templates HTML
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
    nombres = _safe_text(boleto.get("nombres"))
    apellido_paterno = _safe_text(boleto.get("apellido_paterno"))
    codigo_reserva = _safe_text(boleto.get("codigo_reserva", boleto.get("codigo_qr", "")))
    origen = _safe_text(boleto.get("origen"))
    destino = _safe_text(boleto.get("destino"))
    fecha_hora = _safe_text(boleto.get("fecha_hora_salida"))
    empresa = _safe_text(boleto.get("empresa"))
    numero_asiento = _safe_text(boleto.get("numero_asiento"))
    tipo_servicio = _safe_text(boleto.get("tipo_servicio", "Normal")).upper()
    precio = _safe_text(boleto.get("precio_final", 0))

    body = f"""
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;">¡Compra confirmada!</h1>
      <p style="margin:0 0 24px;color:{_MUTED};font-size:14px;line-height:1.5;">
        Hola <strong>{nombres} {apellido_paterno}</strong>,
        tu pago fue procesado correctamente. Adjuntamos tu boleto en PDF.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:{_BRAND_BG};border:1px solid #dbeafe;border-radius:10px;padding:20px;margin-bottom:24px;">
        <tr>
          <td>
            <p style="margin:0 0 4px;font-size:12px;color:{_MUTED};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Código de reserva</p>
            <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:{_BRAND};">{codigo_reserva}</p>
            <p style="margin:0 0 4px;font-size:12px;color:{_MUTED};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Ruta</p>
            <p style="margin:0 0 16px;font-size:16px;font-weight:600;">{origen} → {destino}</p>
            <p style="margin:0 0 4px;font-size:12px;color:{_MUTED};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Fecha y hora</p>
            <p style="margin:0;font-size:14px;">{fecha_hora}</p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 8px;font-size:14px;line-height:1.6;">
        <strong>Empresa:</strong> {empresa}<br>
        <strong>Asiento:</strong> {numero_asiento}<br>
        <strong>Servicio:</strong> {tipo_servicio}<br>
        <strong>Total:</strong> S/ {precio}
      </p>

      <p style="margin:24px 0 0;font-size:13px;color:{_MUTED};line-height:1.5;">
        Presenta el PDF adjunto o el código QR en el counter de embarque.
        Guarda este correo como respaldo de tu compra.
      </p>
    """
    return _layout(body)


def _render_claim_received_html(reclamo: dict) -> str:
    id_reclamo = int(reclamo.get("id_reclamo") or 0)
    motivo = _safe_text(reclamo.get("motivo"))
    detalle = _safe_text(reclamo.get("detalle"))

    body = f"""
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;">Reclamo recibido</h1>
      <p style="margin:0 0 24px;color:{_MUTED};font-size:14px;line-height:1.5;">
        Hola, hemos registrado tu reclamo con el siguiente código de seguimiento:
        <strong style="color:{_BRAND};">REC-{str(id_reclamo).zfill(6)}</strong>.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:24px;">
        <tr><td>
          <p style="margin:0 0 8px;font-size:12px;color:{_MUTED};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Motivo</p>
          <p style="margin:0 0 16px;font-size:14px;font-weight:600;">{motivo}</p>
          <p style="margin:0 0 8px;font-size:12px;color:{_MUTED};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Detalle</p>
          <p style="margin:0;font-size:14px;line-height:1.5;white-space:pre-wrap;">{detalle}</p>
        </td></tr>
      </table>

      <p style="margin:0;font-size:13px;color:{_MUTED};line-height:1.5;">
        Te mantendremos informado por este medio cuando la agencia
        responda o cambie el estado del reclamo.
      </p>
    """
    return _layout(body)


def _render_claim_responded_html(reclamo: dict, respuesta: str, estado: str) -> str:
    id_reclamo = int(reclamo.get("id_reclamo") or 0)
    respuesta_safe = _safe_text(respuesta)
    estado_safe = _safe_text(estado)

    body = f"""
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;">Tu reclamo tiene una respuesta</h1>
      <p style="margin:0 0 24px;color:{_MUTED};font-size:14px;line-height:1.5;">
        La agencia respondió a tu reclamo
        <strong style="color:{_BRAND};">REC-{str(id_reclamo).zfill(6)}</strong>.
        Estado actual: <strong>{estado_safe}</strong>.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:{_BRAND_BG};border:1px solid #dbeafe;border-radius:10px;padding:20px;margin-bottom:24px;">
        <tr><td>
          <p style="margin:0 0 8px;font-size:12px;color:{_MUTED};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Respuesta de la agencia</p>
          <p style="margin:0;font-size:14px;line-height:1.6;white-space:pre-wrap;">{respuesta_safe}</p>
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
    """Wrapper SMTP genérico con graceful degradation."""

    def __init__(self) -> None:
        self.smtp_host = os.getenv("SMTP_HOST", "").strip()
        self.smtp_port = int(os.getenv("SMTP_PORT", "587") or "587")
        self.smtp_user = os.getenv("SMTP_USER", "").strip()
        self.smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
        self.smtp_from = os.getenv("SMTP_FROM_EMAIL", "").strip() or self.smtp_user
        self.smtp_use_tls = os.getenv("SMTP_USE_TLS", "true").lower() in (
            "1", "true", "yes"
        )
        self.smtp_enabled = bool(
            self.smtp_host and self.smtp_user and self.smtp_password
        )

        if self.smtp_enabled:
            logger.info(
                "EmailService: SMTP habilitado (host=%s from=%s)",
                self.smtp_host,
                self.smtp_from,
            )
        else:
            logger.warning(
                "EmailService en modo disabled: SMTP_HOST no está configurado. "
                "Los emails no se enviarán hasta configurarlo."
            )

    @property
    def enabled(self) -> bool:
        return self.smtp_enabled

    @property
    def primary_from(self) -> str:
        return self.smtp_from or self.smtp_user

    def _send_smtp(
        self,
        to_email: str,
        subject: str,
        html: str,
        text: str,
        attachment: Optional[tuple[str, bytes]] = None,
    ) -> bool:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = self.smtp_from
        msg["To"] = to_email
        msg.set_content(text)
        msg.add_alternative(html, subtype="html")
        if attachment is not None:
            filename, content = attachment
            msg.add_attachment(
                content,
                maintype="application",
                subtype="pdf",
                filename=filename,
            )
        try:
            if self.smtp_use_tls:
                with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=15) as srv:
                    srv.ehlo()
                    srv.starttls()
                    srv.ehlo()
                    srv.login(self.smtp_user, self.smtp_password)
                    srv.send_message(msg)
            else:
                with smtplib.SMTP_SSL(self.smtp_host, self.smtp_port, timeout=15) as srv:
                    srv.login(self.smtp_user, self.smtp_password)
                    srv.send_message(msg)
            logger.info("[SMTP] email enviado a %s via %s", to_email, self.smtp_host)
            return True
        except Exception as exc:  # noqa: BLE001
            logger.exception("[SMTP] fallo enviando a %s: %s", to_email, exc)
            return False

    def _send(
        self,
        to_email: str,
        subject: str,
        html: str,
        text: str,
        attachment: Optional[tuple[str, bytes]] = None,
    ) -> bool:
        if not self.smtp_enabled:
            return False
        return self._send_smtp(to_email, subject, html, text, attachment)

    # ------------------------------------------------------------------
    # API pública
    # ------------------------------------------------------------------
    def send_compra_confirmation(
        self,
        to_email: str,
        boleto: dict,
        codigo_reserva: str,
    ) -> bool:
        if not self.enabled or not to_email:
            return False
        pdf_bytes = generate_ticket_pdf(
            {**boleto, "codigo_qr": boleto.get("codigo_qr", codigo_reserva)}
        )
        return self._send(
            to_email=to_email,
            subject=(
                f"Tu boleto Bustoke - "
                f"{boleto.get('origen', '')} → {boleto.get('destino', '')}"
            ),
            html=_render_compra_html({**boleto, "codigo_reserva": codigo_reserva}),
            text=(
                f"Tu compra fue confirmada. Código de reserva: {codigo_reserva}. "
                "Adjuntamos tu boleto en PDF."
            ),
            attachment=(f"boleto-bustoke-{codigo_reserva}.pdf", pdf_bytes),
        )

    def send_claim_received(self, to_email: str, reclamo: dict) -> bool:
        if not self.enabled or not to_email:
            return False
        return self._send(
            to_email=to_email,
            subject=(
                f"Reclamo REC-{str(reclamo.get('id_reclamo', 0)).zfill(6)} "
                f"recibido"
            ),
            html=_render_claim_received_html(reclamo),
            text=(
                f"Hemos registrado tu reclamo "
                f"REC-{str(reclamo.get('id_reclamo', 0)).zfill(6)}. "
                f"Motivo: {reclamo.get('motivo', '')}"
            ),
        )

    def send_claim_responded(
        self,
        to_email: str,
        reclamo: dict,
        respuesta: str,
        estado: str,
    ) -> bool:
        if not self.enabled or not to_email:
            return False
        return self._send(
            to_email=to_email,
            subject=(
                f"Tu reclamo REC-{str(reclamo.get('id_reclamo', 0)).zfill(6)} "
                f"tiene respuesta"
            ),
            html=_render_claim_responded_html(reclamo, respuesta, estado),
            text=(
                f"Tu reclamo REC-{str(reclamo.get('id_reclamo', 0)).zfill(6)} "
                f"tiene respuesta. Estado: {estado}."
            ),
        )


# Singleton
_email_service: Optional[EmailService] = None


def get_email_service() -> EmailService:
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service
