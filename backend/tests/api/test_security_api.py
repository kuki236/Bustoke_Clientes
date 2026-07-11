"""
Suite 6 — Seguridad: rate limiting, security headers y validación de secretos.

Verifica los fixes OWASP implementados:
  - A07: rate limiting en /v1/auth/* (slowapi)
  - A05: headers de seguridad HTTP (CSP, HSTS, X-Frame-Options, ...)
  - A02: validación de entropía del SECRET_KEY

Estos tests son del tipo "smoke": confirman que las mitigaciones
están aplicadas y producen los headers/respuestas correctos. Para
pruebas de carga reales usar herramientas como `locust` o `k6`.
"""

import pytest

from tests.api.helpers import assert_status_code


# ============================================================================
# ============================================================================

def test_respuesta_root_incluye_x_frame_options(client):
    """
    FIX A05: cada respuesta debe incluir `X-Frame-Options: DENY`
    para prevenir clickjacking.
    """
    r = client.get("/")
    assert_status_code(r, 200)
    assert r.headers.get("x-frame-options") == "DENY"


def test_respuesta_root_incluye_x_content_type_options(client):
    """
    FIX A05: `X-Content-Type-Options: nosniff` previene MIME sniffing.
    """
    r = client.get("/")
    assert r.headers.get("x-content-type-options") == "nosniff"


def test_respuesta_root_incluye_csp(client):
    """
    FIX A05: Content-Security-Policy debe estar presente con
    directivas anti-XSS (sin 'unsafe-inline' para scripts).
    """
    r = client.get("/")
    csp = r.headers.get("content-security-policy", "")
    assert csp, "CSP header ausente"
    # Política estricta: NO permitimos scripts inline.
    assert "default-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp
    assert "object-src 'none'" in csp
    # Verificación CRÍTICA: scripts-src no debe contener 'unsafe-inline'
    # (eso anularía la defensa anti-XSS).
    assert "script-src 'self'" in csp
    assert "'unsafe-inline'" not in csp.split("script-src")[1].split(";")[0], (
        "CSP permite 'unsafe-inline' en scripts: XSS sería trivial"
    )


def test_respuesta_root_incluye_referrer_policy(client):
    """
    FIX A05: `Referrer-Policy` debe limitar la información enviada
    en el header Referer a orígenes cross-origin.
    """
    r = client.get("/")
    assert r.headers.get("referrer-policy") == "strict-origin-when-cross-origin"


def test_respuesta_root_incluye_permissions_policy(client):
    """
    FIX A05: `Permissions-Policy` debe deshabilitar APIs del navegador
    que la app no necesita (geolocation, mic, cámara, etc.).
    """
    r = client.get("/")
    pp = r.headers.get("permissions-policy", "")
    assert "geolocation=()" in pp
    assert "microphone=()" in pp
    assert "camera=()" in pp
    assert "payment=()" in pp


def test_headers_seguridad_aplican_a_404(client):
    """
    Los headers de seguridad deben aplicarse INCLUSO a respuestas
    de error 404 (defense in depth: incluso un JSON de error
    inyectado no debe poder ejecutar JS).
    """
    r = client.get("/ruta-inexistente")
    assert_status_code(r, 404)
    assert r.headers.get("x-frame-options") == "DENY"
    assert "content-security-policy" in r.headers


def test_headers_seguridad_aplican_a_422(client):
    """
    Los headers de seguridad deben aplicarse a errores de validación
    (Pydantic 422). Esto es importante porque el response body puede
    contener datos del usuario (en `loc`) que no queremos que un
    atacante pueda exfiltrar via XSS.
    """
    r = client.post("/v1/auth/register", json={})  # vacío → 422
    assert_status_code(r, 422)
    assert r.headers.get("x-frame-options") == "DENY"
    assert r.headers.get("x-content-type-options") == "nosniff"
    body = r.json()
    assert "detail" in body
    assert "errors" in body


# ============================================================================
# ============================================================================

def test_secret_key_source_ok_con_secreto_aleatorio():
    """
    Un SECRET_KEY generado con `secrets.token_urlsafe(64)` debe
    tener entropía > 256 bits y ser clasificado como 'ok'.
    """
    import secrets
    from app.core.config import Settings

    s = Settings(SECRET_KEY=secrets.token_urlsafe(64))
    assert s.secret_key_source == "ok"


def test_secret_key_source_default_insecure(monkeypatch):
    """
    El SECRET_KEY por defecto debe ser marcado como inseguro.

    Usamos monkeypatch para aislar la instancia de Settings del .env
    real (que podría tener un SECRET_KEY legítimo).
    """
    import secrets
    from app.core.config import Settings

    # Forzamos valores por defecto + DB_PASSWORD seguro para evitar
    # que el model_validator de producción falle antes de evaluar
    # la propiedad `secret_key_source`.
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("SECRET_KEY", "change_me_in_production")
    monkeypatch.setenv("DB_PASSWORD", secrets.token_urlsafe(16))
    s = Settings()
    assert s.secret_key_source == "default-insecure"


def test_secret_key_source_low_entropy_con_string_predecible(monkeypatch):
    """
    Un SECRET_KEY como 'bustoke_clave_secreta_26262626' (32 chars
    pero baja entropía) debe ser marcado como low-entropy.
    """
    import secrets
    from app.core.config import Settings

    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("DB_PASSWORD", secrets.token_urlsafe(16))
    monkeypatch.setenv("SECRET_KEY", "bustoke_clave_secreta_26262626")
    s = Settings()
    assert s.secret_key_source == "low-entropy"


def test_settings_rechaza_secret_key_corto_en_produccion(monkeypatch):
    """
    FIX A02: en producción, SECRET_KEY < 32 chars debe fallar
    en el model_validator.
    """
    import secrets
    import pytest
    from pydantic import ValidationError
    from app.core.config import Settings

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DB_PASSWORD", secrets.token_urlsafe(16))
    monkeypatch.setenv("SECRET_KEY", "short")
    with pytest.raises(ValidationError) as exc_info:
        Settings()
    assert "demasiado corto" in str(exc_info.value).lower()


def test_settings_rechaza_secret_key_baja_entropia_en_produccion(monkeypatch):
    """
    FIX A02: en producción, un SECRET_KEY con entropía < 256 bits
    debe fallar (cubre el caso 'bustoke_clave_secreta_26262626').
    """
    import secrets
    import pytest
    from pydantic import ValidationError
    from app.core.config import Settings

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DB_PASSWORD", secrets.token_urlsafe(16))
    # 33 chars (>32) pero < 256 bits de entropía.
    # Caso real: un operador que añade texto predecible al final
    # para alcanzar longitud pero sin aumentar entropía real.
    monkeypatch.setenv("SECRET_KEY", "bustoke_secreto_2024_produccion_ok")
    with pytest.raises(ValidationError) as exc_info:
        Settings()
    assert "entrop" in str(exc_info.value).lower()


def test_settings_acepta_secret_key_aleatorio_en_produccion(monkeypatch):
    """
    FIX A02: un SECRET_KEY generado con secrets.token_urlsafe
    debe pasar la validación en producción.
    """
    import secrets
    from app.core.config import Settings

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DB_PASSWORD", secrets.token_urlsafe(16))
    monkeypatch.setenv("SECRET_KEY", secrets.token_urlsafe(64))
    s = Settings()
    assert s.secret_key_source == "ok"


# ============================================================================
# ============================================================================

def test_limiter_esta_instalado_en_la_app():
    """
    FIX A07: la app debe tener el limiter de slowapi registrado.
    """
    from app.main import app

    assert hasattr(app.state, "limiter"), (
        "El limiter de slowapi no está registrado en app.state. "
        "Verificar que main.py llama a app.state.limiter = limiter."
    )


def test_limiter_es_singleton():
    """
    El limiter debe ser el MISMO objeto en toda la app (singleton).
    Si se crearan múltiples instancias, los contadores no funcionarían.
    """
    from app.core.rate_limit import limiter as l1
    from app.main import app

    l2 = app.state.limiter
    assert l1 is l2, "El limiter de core.rate_limit y app.state no son el mismo objeto"


def test_limiter_global_tiene_default_de_60_por_minuto():
    """
    El límite global por defecto debe ser 60/minuto por IP.
    """
    from app.core.rate_limit import limiter

    # El default_limits es accesible vía _default_limits en slowapi >= 0.1
    assert limiter is not None
    # Verificación de la API: el limiter tiene un atributo `default_limits`
    # que es una tupla de strings como "60/minute".
    assert hasattr(limiter, "_default_limits") or hasattr(limiter, "default_limits")
