# 🛡️ SECURITY.md — Política de Seguridad de Bustoke

## Reporte de vulnerabilidades

| # | Severidad | Estado | Descripción |
|---|---|---|---|
| 1 | 🔴 Crítica | ✅ Mitigado en este PR | Sin rate limiting en endpoints de auth (A07) |
| 2 | 🔴 Crítica | ⚠️ Documentado | Tokens JWT en `localStorage` (XSS) |
| 3 | 🟠 Alta | ✅ Mitigado en este PR | `SECRET_KEY` con entropía insuficiente (A02) |
| 4 | 🟠 Alta | ✅ Mitigado en este PR | Sin headers de seguridad HTTP (A05) |
| 5 | 🟡 Media | 🛠 Pendiente | Enumeración de emails en `/register` |
| 6 | 🟡 Media | 🛠 Pendiente | `bcrypt` trunca contraseñas a 72 bytes |
| 7 | 🟡 Media | 🛠 Pendiente | CORS permite orígenes de desarrollo en prod |

**Reporte completo**: ver [`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md).

## Cómo reportar vulnerabilidades

Si descubres una vulnerabilidad de seguridad en Bustoke, por favor:
1. **NO** abras un issue público en GitHub.
2. Envía un email a `security@bustoke.pe` con:
   - Descripción detallada de la vulnerabilidad
   - Pasos para reproducirla
   - Impacto potencial
3. Nos comprometemos a responder en 48h hábiles y a corregir
   vulnerabilidades críticas en 7 días.

## Cambios recientes

### 2026-07-08 — Hardening inicial
- ✅ `slowapi` instalado para rate limiting en `/v1/auth/*` y `/v1/seats/hold`.
- ✅ Validador de entropía para `SECRET_KEY` (mín. 256 bits).
- ✅ Middleware de security headers: CSP, HSTS, X-Frame-Options, etc.
- ✅ `validation_exception_handler` ahora usa `jsonable_encoder` (FIX A02).
- ✅ Sanitización de helpers de frontend (`sanitize.js`).

## Roadmap de seguridad

| Cuándo | Acción |
|---|---|
| Q3 2026 | Migrar de JWT en `localStorage` a cookies `httpOnly` + CSRF tokens |
| Q3 2026 | Implementar endpoint `POST /v1/auth/logout` con blacklist de refresh tokens |
| Q3 2026 | Migrar de `bcrypt` a `argon2-cffi` (rehash progresivo en login) |
| Q4 2026 | Implementar 2FA (TOTP) para admins de agencia |
| Q4 2026 | Auditoría externa de seguridad |

## Generar un SECRET_KEY seguro

```bash
# 64 bytes URL-safe (~86 chars), entropía = 512 bits. RECOMENDADO.
python -c "import secrets; print(secrets.token_urlsafe(64))"

# Alternativa con openssl (256 bits).
openssl rand -base64 32

# Windows PowerShell (256 bits).
[System.Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))
```

## Configuración de seguridad recomendada

`.env` (producción):
```bash
APP_ENV=production
APP_DEBUG=false
SECRET_KEY=<output del comando anterior>
DB_PASSWORD=<password aleatorio de 32+ chars>
CORS_ORIGINS=https://bustoke.clientes,https://www.bustoke.clientes
RATE_LIMIT_ENABLED=true
CSP_ALLOW_INLINE_STYLES=false
```

## Despliegue seguro

- ✅ HTTPS obligatorio (HSTS con `max-age=31536000`).
- ✅ WAF delante del backend (Cloudflare, Render WAF).
- ✅ Logs centralizados (Datadog, Sentry).
- ✅ Backups cifrados de la BD (at-rest + in-transit).
- ✅ Rotación de `SECRET_KEY` cada 90 días (ver `SECURITY_AUDIT.md` § "Plan de rotación").

## Contacto

- Email: security@bustoke.pe
- PGP key: por definir
- Tiempo de respuesta: 48h hábiles
