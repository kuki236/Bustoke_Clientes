"""
Script de diagnóstico para el fallback SMTP (RF-08).

Uso:
  .\venv\Scripts\python.exe scripts\test_smtp.py
  .\venv\Scripts\python.exe scripts\test_smtp.py otro@correo.com
"""

import os
import smtplib
import sys
from email.message import EmailMessage
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv()

SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or "587")
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.getenv("SMTP_FROM_EMAIL", "").strip() or SMTP_USER
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")
TO_EMAIL = sys.argv[1] if len(sys.argv) > 1 else SMTP_USER

print("=" * 60)
print("DIAGNÓSTICO DE SMTP")
print("=" * 60)
print(f"Host:       {SMTP_HOST or '(vacío)'}")
print(f"Port:       {SMTP_PORT}")
print(f"User:       {SMTP_USER or '(vacío)'}")
print(f"Password:   {'*' * len(SMTP_PASSWORD) if SMTP_PASSWORD else '(vacío)'}")
print(f"From:       {SMTP_FROM}")
print(f"TLS:        {SMTP_USE_TLS}")
print(f"Para:       {TO_EMAIL}")
print()

if not (SMTP_HOST and SMTP_USER and SMTP_PASSWORD):
    print("ERROR: SMTP_HOST, SMTP_USER y SMTP_PASSWORD son requeridos.")
    print("Seguí las instrucciones de Gmail App Password en .env.example")
    sys.exit(1)

# Test 1: conexión + login
print("--- Test 1: Conexión + login ---")
try:
    if SMTP_USE_TLS:
        srv = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15)
        srv.ehlo()
        srv.starttls()
        srv.ehlo()
    else:
        srv = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=15)
    srv.login(SMTP_USER, SMTP_PASSWORD)
    print("  OK - Conexión y autenticación exitosas")
    srv.quit()
except Exception as exc:
    print(f"  ERROR: {exc}")
    sys.exit(1)

# Test 2: enviar email
print()
print("--- Test 2: Enviar email de prueba ---")
try:
    msg = EmailMessage()
    msg["Subject"] = "BUSTOKE - Test SMTP"
    msg["From"] = SMTP_FROM
    msg["To"] = TO_EMAIL
    msg.set_content(
        "BUSTOKE test: si ves este correo, el SMTP funciona correctamente."
    )
    msg.add_alternative(
        '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;">'
        '<h1 style="color:#2563eb;">Email de prueba</h1>'
        "<p>Si ves este correo, <strong>SMTP esta correctamente configurado</strong> "
        "en el backend de BUSTOKE.</p>"
        '<p style="color:#64748b;font-size:12px;">Enviado desde <code>scripts/test_smtp.py</code></p>'
        "</div>",
        subtype="html",
    )
    if SMTP_USE_TLS:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as srv:
            srv.ehlo()
            srv.starttls()
            srv.ehlo()
            srv.login(SMTP_USER, SMTP_PASSWORD)
            srv.send_message(msg)
    else:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=15) as srv:
            srv.login(SMTP_USER, SMTP_PASSWORD)
            srv.send_message(msg)
    print("  OK - Email enviado")
    print()
    print(f"  Revisa la bandeja de {TO_EMAIL}")
    print("  (y la carpeta de spam si no aparece en 30 segundos).")
except Exception as exc:
    print(f"  ERROR: {exc}")
    sys.exit(1)
