"""
Servicio de generación de PDFs (RF-08).

Genera el PDF del boleto de viaje en el backend (usado por el email
service para adjuntarlo a la confirmación de compra). El frontend
también genera su propio PDF con `jsPDF` para descarga directa desde
la pantalla Mis Viajes.

FIX BUG-076/XBUG-018: los strings del boleto se sanitizan con
`_pdf_safe_text()` antes de pasarlos a `reportlab`. `reportlab`
NO interpreta HTML, pero igualmente removemos caracteres de control
y normalizamos espacios para evitar inyecciones básicas en clientes
PDF vulnerables.
"""

from datetime import datetime
from io import BytesIO
import re

import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas


def _safe(value, fallback="—"):
    if value is None or value == "":
        return fallback
    return str(value).strip()


# FIX BUG-076/XBUG-018: filtra caracteres que reportlab o visores PDF
# puedan interpretar de forma inesperada (caracteres de control, tags
# tipo <script>, etc.). No es HTML-escape porque PDF no renderiza HTML,
# pero limita la superficie de ataque.
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _pdf_safe_text(value, fallback: str = "—") -> str:
    if value is None:
        return fallback
    cleaned = _CONTROL_CHARS.sub("", str(value))
    return cleaned.strip() or fallback


def _format_price(value):
    if value is None:
        return "—"
    try:
        return f"S/ {float(value):.2f}"
    except (TypeError, ValueError):
        return "—"


def _format_time(value):
    if not value:
        return "—"
    if isinstance(value, str):
        try:
            d = datetime.fromisoformat(value)
            return d.strftime("%H:%M")
        except ValueError:
            return value
    if isinstance(value, datetime):
        return value.strftime("%H:%M")
    return str(value)


def _format_date(value):
    if not value:
        return "—"
    if isinstance(value, str):
        try:
            d = datetime.fromisoformat(value)
            return d.strftime("%d/%m/%Y")
        except ValueError:
            return value
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y")
    return str(value)


def _qr_png_bytes(data: str) -> bytes:
    """Genera el PNG del QR como bytes (para embeber en el PDF)."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=1,
    )
    qr.add_data(data or "BUSTOKE")
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0f172a", back_color="white")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def generate_ticket_pdf(boleto: dict) -> bytes:
    """
    Renderiza el PDF del boleto (RF-08) y devuelve los bytes.

    El dict `boleto` espera las claves:
    - codigo_qr, precio_final, fecha_emision
    - origen, destino, fecha_hora_salida, fecha_hora_llegada, rampa_embarque
    - empresa, placa_bus, numero_asiento, tipo_servicio, chofer (dict opcional)
    """
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    # ---- Header azul ----
    c.setFillColorRGB(0.145, 0.388, 0.922)
    c.rect(0, height - 28 * mm, width, 28 * mm, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(14 * mm, height - 18 * mm, "BUSTOKE - Boleto de Viaje")
    c.setFont("Helvetica", 10)
    c.drawRightString(
        width - 14 * mm,
        height - 18 * mm,
        f"Empresa: {_pdf_safe_text(boleto.get('empresa'), 'BUSTOKE')}",
    )
    c.setFillColorRGB(0.06, 0.09, 0.16)

    # ---- Ruta ----
    y = height - 50 * mm
    c.setFont("Helvetica-Bold", 11)
    c.setFillColorRGB(0.28, 0.33, 0.41)
    c.drawString(14 * mm, y, "RUTA")
    c.setFillColorRGB(0.06, 0.09, 0.16)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(14 * mm, y - 10 * mm, _pdf_safe_text(boleto.get("origen")))
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(0.39, 0.45, 0.55)
    c.drawString(
        14 * mm, y - 16 * mm, _format_time(boleto.get("fecha_hora_salida"))
    )
    c.drawString(
        14 * mm, y - 22 * mm, _format_date(boleto.get("fecha_hora_salida"))
    )

    c.setStrokeColorRGB(0.58, 0.64, 0.72)
    c.setDash(2, 2)
    c.line(14 * mm, y - 32 * mm, width - 14 * mm, y - 32 * mm)
    c.setDash()

    c.setFont("Helvetica-Bold", 16)
    c.setFillColorRGB(0.06, 0.09, 0.16)
    c.drawString(14 * mm, y - 42 * mm, _pdf_safe_text(boleto.get("destino")))
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(0.39, 0.45, 0.55)
    c.drawString(
        14 * mm, y - 48 * mm, _format_time(boleto.get("fecha_hora_llegada"))
    )

    # ---- Grilla de detalles (2 columnas x 4 filas) ----
    items = [
        ("FECHA", _format_date(boleto.get("fecha_hora_salida"))),
        ("SALIDA", _format_time(boleto.get("fecha_hora_salida"))),
        ("LLEGADA", _format_time(boleto.get("fecha_hora_llegada"))),
        ("ASIENTO", _pdf_safe_text(boleto.get("numero_asiento"))),
        ("SERVICIO", _pdf_safe_text(boleto.get("tipo_servicio"), "Normal").upper()),
        ("PRECIO", _format_price(boleto.get("precio_final"))),
        (
            "CHOFER",
            _pdf_safe_text(
                boleto.get("chofer_nombre")
                if isinstance(boleto.get("chofer"), dict)
                else boleto.get("chofer")
            ),
        ),
        ("RAMPA", _pdf_safe_text(boleto.get("rampa_embarque"), "Por asignar")),
    ]
    grid_y = y - 70 * mm
    col_w = (width - 28 * mm) / 2
    row_h = 14 * mm
    for idx, (label, value) in enumerate(items):
        col = idx % 2
        row = idx // 2
        x = 14 * mm + col * col_w
        cy = grid_y - row * row_h
        c.setStrokeColorRGB(0.89, 0.91, 0.94)
        c.setFillColorRGB(0.97, 0.98, 0.99)
        c.roundRect(
            x,
            cy - row_h + 2 * mm,
            col_w - 4 * mm,
            row_h - 2 * mm,
            3,
            stroke=1,
            fill=1,
        )
        c.setFillColorRGB(0.39, 0.45, 0.55)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(x + 2 * mm, cy - 4 * mm, label)
        c.setFillColorRGB(0.06, 0.09, 0.16)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(x + 2 * mm, cy - 10 * mm, _pdf_safe_text(value))

    # ---- QR a la izquierda + instrucciones a la derecha ----
    qr_y = grid_y - 4 * row_h - 6 * mm
    qr_size = 50 * mm
    qr_data = _pdf_safe_text(
        boleto.get("codigo_qr"),
        f"BUSTOKE-{boleto.get('id_boleto', '')}",
    )
    try:
        from reportlab.lib.utils import ImageReader

        png_bytes = _qr_png_bytes(qr_data)
        c.drawImage(
            ImageReader(BytesIO(png_bytes)),
            14 * mm,
            qr_y - qr_size,
            qr_size,
            qr_size,
        )
    except Exception:
        c.setFont("Helvetica", 8)
        c.drawString(14 * mm, qr_y - 10 * mm, f"[QR: {qr_data}]")

    c.setFont("Helvetica-Bold", 8)
    c.setFillColorRGB(0.28, 0.33, 0.41)
    c.drawString(14 * mm, qr_y - qr_size - 4 * mm, "CÓDIGO QR")
    c.setFont("Helvetica", 7)
    c.setFillColorRGB(0.39, 0.45, 0.55)
    c.drawString(
        14 * mm,
        qr_y - qr_size - 8 * mm,
        "Presenta este código al abordar.",
    )

    # Instrucciones
    ins_x = 14 * mm + qr_size + 12 * mm
    c.setFont("Helvetica-Bold", 10)
    c.setFillColorRGB(0.06, 0.09, 0.16)
    c.drawString(ins_x, qr_y - 6 * mm, "INSTRUCCIONES PARA EL PASAJERO")
    c.setFont("Helvetica", 8)
    c.setFillColorRGB(0.28, 0.33, 0.41)
    lines = [
        "1. Llega al terminal 30 min antes de la salida.",
        "2. Presenta tu DNI y este boleto (impreso o digital).",
        "3. Escanea el QR en el counter de embarque.",
        "4. Conserva tu boleto durante todo el viaje.",
    ]
    for i, ln in enumerate(lines):
        c.drawString(ins_x, qr_y - 14 * mm - i * 5 * mm, ln)

    # ---- Footer ----
    c.setStrokeColorRGB(0.89, 0.91, 0.94)
    c.line(14 * mm, 18 * mm, width - 14 * mm, 18 * mm)
    c.setFont("Helvetica", 7)
    c.setFillColorRGB(0.58, 0.64, 0.72)
    c.drawCentredString(
        width / 2,
        12 * mm,
        "BUSTOKE © 2026 · Documento generado electrónicamente · No requiere firma",
    )

    c.showPage()
    c.save()
    return buf.getvalue()
