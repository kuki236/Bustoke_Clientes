"""
Middleware de headers de seguridad HTTP (FIX A05 — OWASP Secure Headers).

Aplica los headers recomendados por OWASP a TODAS las respuestas del
backend FastAPI. Es seguro para una API JSON pura: el backend no sirve
assets estáticos, por lo que CSP estricto no rompe nada.

Headers aplicados:
  - X-Frame-Options: DENY                 (anti-clickjacking)
  - X-Content-Type-Options: nosniff      (anti-MIME-sniffing)
  - Referrer-Policy: strict-origin...    (anti-referer-leak)
  - Permissions-Policy: ...              (deshabilita APIs del browser)
  - Strict-Transport-Security: ...       (solo en HTTPS)
  - Content-Security-Policy: ...         (defensa anti-XSS)

Referencia: https://owasp.org/www-project-secure-headers/
"""

import logging
import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)


# Política CSP por defecto. NO usamos 'unsafe-inline' para scripts
# (defensa anti-XSS estricta). Styled-components / Tailwind pueden
# necesitar 'unsafe-inline' en estilos durante dev — lo permitimos
# solo si la variable de entorno `CSP_ALLOW_INLINE_STYLES=true`.
DEFAULT_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src {STYLE_SRC}; "
    "img-src 'self' data: https:; "
    "font-src 'self' data:; "
    "connect-src 'self' https://bustoke-backend.onrender.com; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "object-src 'none'; "
    "upgrade-insecure-requests"
)


def _build_csp() -> str:
    """Compila la CSP final según variables de entorno."""
    allow_inline_styles = os.getenv("CSP_ALLOW_INLINE_STYLES", "false").lower() == "true"
    style_src = "'self' 'unsafe-inline'" if allow_inline_styles else "'self'"
    return DEFAULT_CSP.replace("{STYLE_SRC}", style_src)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware que añade headers de seguridad a cada respuesta HTTP.

    Se aplica a TODAS las rutas (incluido /health, /docs, /v1/*) sin
    excluir ninguna — la regla de oro en security headers es que no
    deben depender de la ruta.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Anti-clickjacking (CSP frame-ancestors es más moderno, pero
        # X-Frame-Options sigue siendo compatible con navegadores viejos).
        response.headers.setdefault("X-Frame-Options", "DENY")

        # Anti-MIME-sniffing.
        response.headers.setdefault("X-Content-Type-Options", "nosniff")

        # Anti-referer-leak: solo se envía el origen (no la URL completa)
        # a recursos cross-origin.
        response.headers.setdefault(
            "Referrer-Policy", "strict-origin-when-cross-origin"
        )

        # Deshabilita APIs del navegador que la app NO usa. Reduce
        # superficie de ataque si un XSS logra ejecutarse.
        response.headers.setdefault(
            "Permissions-Policy",
            "geolocation=(), microphone=(), camera=(), payment=(), usb=()",
        )

        # HSTS: solo cuando la conexión es HTTPS. En HTTP (dev) el
        # navegador lo ignora, pero añadirlo causaría warnings de
        # mixed content en el dev server.
        if request.url.scheme == "https":
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains; preload",
            )

        # CSP: la defensa más fuerte contra XSS. Aplica también a
        # respuestas de error (4xx/5xx) para que un JSON de error
        # inyectado no pueda ejecutar JS.
        response.headers.setdefault("Content-Security-Policy", _build_csp())

        # Server header removal: no leak info del framework.
        # Starlette ya no expone 'server' por defecto, pero por si acaso.
        if "server" in response.headers:
            del response.headers["server"]

        return response
