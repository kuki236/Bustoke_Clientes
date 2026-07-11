# 🧪 Suite de Pruebas Automatizadas — Bustoke

Suite completa de testing E2E para la plataforma Bustoke, organizada en una
capa principal de API más la suite de UI:

| Capa | Stack | Cobertura | Carpeta |
|---|---|---|---|
| **API** | `pytest` + `TestClient` (FastAPI) + **PostgreSQL real** (`bustoke_test`) | Health, Auth, Travels, Seats, Claims, Bookings, Hold cleanup, Security headers & secret entropy | [`backend/tests/api/`](backend/tests/api/) |
| **UI** | `Cypress 14` + selectores `aria-label`/`placeholder` | Búsqueda de viajes + Selección y bloqueo de asiento | [`frontend-client/cypress/`](frontend-client/cypress/) |

## 📊 Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Tests API (suite única consolidada) | **101** ✅ |
| Tests UI (specs Cypress) | **9** |
| Tiempo de ejecución API | ~70s |
| Aislamiento de datos | `TRUNCATE TABLE ... RESTART IDENTITY CASCADE` por test (PostgreSQL real) |
| Cobertura de endpoints `/v1` | `auth`, `travels`, `seats`, `claims`, `bookings`, `health` |

## 🚀 Ejecución rápida

### Backend (pytest)

```bash
cd backend
# (Solo la primera vez) crear venv e instalar deps:
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

# Prerrequisito para los tests: tener PostgreSQL local con la BD
# `bustoke_test` cargada con el esquema de `bustoke_bd.sql`:
#   psql -U postgres -h localhost -d bustoke_test -f ../bustoke_bd.sql

# Correr la suite completa de API:
pytest tests/api -v

# Alias equivalente (toda la suite del backend):
pytest tests/ -v
```

Usa **PostgreSQL real** (BD `bustoke_test` en `localhost:5432`) con un
`TRUNCATE TABLE ... RESTART IDENTITY CASCADE` al inicio de cada test
para garantizar idempotencia sin tener que recrear el esquema. La
conexión se comparte entre el `db_session` del test y la sesión que
abre el código de FastAPI, evitando problemas de visibilidad entre
transacciones (ver `conftest.py:100-145`).

### Frontend (Cypress)

```bash
cd frontend-client
npm install                       # (incluye cypress@^14.5.0)
npm run dev                       # en otra terminal, levantar Vite (puerto 5173)

# Modo interactivo (recomendado para desarrollo):
npm run cy:open

# Modo headless (CI):
npm run cy:run                    # usa Electron embebido
npm run cy:run:chrome             # Chrome explícito
```

#### Apuntar a staging (Render free tier)

El backend de producción en Render duerme tras 15 min sin tráfico. Para
tolerar el cold start, los specs usan `cy.verificarAPI()` con timeout de
60s y selectores con `{ timeout: 10000 }`.

```bash
# Windows PowerShell:
$env:CYPRESS_API_URL="https://bustoke-backend.onrender.com/v1"
npm run cy:run
```

```bash
# Linux/macOS:
CYPRESS_API_URL=https://bustoke-backend.onrender.com/v1 npm run cy:run
```

## 🗂️ Estructura de archivos

```
Bustoke_Clientes/
├── backend/tests/api/
│   ├── __init__.py              # Docstring del paquete
│   ├── conftest.py              # Fixtures idempotentes (engine, db_session, client, seed_basico, registrar_usuario)
│   ├── helpers.py               # Aserciones reutilizables (assert_status_code, assert_json_keys, ...)
│   ├── test_health_api.py       # 2 tests: /, /health
│   ├── test_auth_api.py         # 19 tests: register, login, me, refresh, enrichment (legacy migrados)
│   ├── test_travels_api.py      # 21 tests: search (con filtros completos), get, mapa asientos
│   ├── test_seats_api.py        # 13 tests: hold, release, release-sync + contratos 405
│   ├── test_claims_api.py       # 16 tests: ciclo de vida + autorización por roles
│   ├── test_bookings_api.py     # 6 tests: TC-BB-017/018/019 + TC-RB-002 (idempotencia MP)
│   ├── test_hold_cleanup.py     # 7 tests: job de expiración (FIX TC-RB-003)
│   └── test_security_api.py     # 17 tests: headers CSP/HSTS, rate limit, secret entropy
│
├── frontend-client/cypress/
│   ├── support/
│   │   ├── e2e.js               # Hook global (limpia localStorage, silencia warnings de React 19)
│   │   └── commands.js          # cy.registrarPasajero, cy.loginAPI, cy.buscarPrimerViaje, cy.verificarAPI
│   ├── e2e/
│   │   ├── 01-busqueda-viajes.cy.js       # Landing → Results (3 tests)
│   │   ├── 02-seleccion-asientos.cy.js    # Mapa de asientos: hold/release/ocupado (4 tests)
│   │   └── 03-flujo-completo.cy.js        # E2E happy path completo (2 tests)
│   ├── fixtures/                # (vacío, listo para expansiones)
│   └── screenshots/             # Auto-generado en runs fallidos
│
├── cypress.config.js            # Config (baseUrl, timeouts, retries, env.apiBaseUrl)
├── cypress.env.json             # Defaults por entorno
└── .env.example                 # Documenta CYPRESS_API_URL, CYPRESS_BASE_URL, vars backend
```

## 🔑 Decisiones de diseño

### Backend

| Decisión | Por qué |
|---|---|
| **PostgreSQL real (`bustoke_test`) con `TRUNCATE ... CASCADE` por test** (`conftest.py:100-145`) | Reproduce fielmente el comportamiento de la BD de producción (enums nativos, vistas, CHECK constraints, FK CASCADE). El TRUNCATE al inicio de cada test garantiza idempotencia sin tener que recrear el esquema. Resuelve el riesgo de `uq_usuarios_email_lower` y `uq_pasajeros_numero_documento` entre runs consecutivos. |
| **Conexión compartida entre `db_session` y la app** (`conftest.py:155-185`) | Reutilizar la misma conexión de SQLAlchemy evita problemas de visibilidad cross-connection (READ COMMITTED) y de `with self.db.begin():` en servicios que abren transacción explícita (`booking_service`). Antes/después de cada request se hace `commit() + expire_all()` para limpiar el estado. |
| **`NullPool` en el engine** (`conftest.py:78-83`) | Cada conexión se abre y cierra por uso, evitando bloqueos con sesiones concurrentes en el mismo proceso de pytest. |
| **`RATE_LIMIT_ENABLED=false` + `HOLD_CLEANUP_DISABLED=true`** (env vars en conftest) | El limiter de slowapi compartiría la key `testclient` y bloquearía los tests. El job de cleanup en background interferiría con el TRUNCATE por test. |
| **Aserciones de contrato (DELETE→405)** | La API de Bustoke no expone DELETE en `/v1/claims/{id}` ni en `/v1/seats/*`. Verificamos explícitamente que devuelvan 405 para detectar acoplamientos accidentales. |
| **BUG-138 en `test_responder_reclamo_con_estado_invalido`** | El `validation_exception_handler` global tiene un bug conocido de serialización con `ValueError`. El test verifica el contrato (input inválido ⇒ rechazo) sin acoplarse al status code exacto. TODO documentado en el test. |
| **BUG rate-limit en `app/api/v1/routes/auth.py:74,101,135`** | ✅ **ARREGLADO 2026-07-11**: el código original usaba `limiter.check(request, "X/minute")` que NO existe en slowapi 0.1.9 (es API de flask-limiter, no de slowapi). El fix usa el decorator idiomático `@limiter.limit("X/minute")` y sincroniza `limiter.enabled` con la env var `RATE_LIMIT_ENABLED` en `app/core/rate_limit.py:_sync_enabled_from_env`. Los tests verifican la flag, no el branch. |

### Frontend

| Decisión | Por qué |
|---|---|
| **`Cypress.env('apiBaseUrl')` en TODOS los `cy.request()`** | Cumple la Observación 1: cero URLs hardcoded. Alternar local/staging es solo cambiar `CYPRESS_API_URL`. |
| **Selectores basados en `aria-label` y `placeholder`** | Resiliencia a refactors de Tailwind. El componente `SeatButton` (`SeatSelectionPage.jsx:248-254`) usa `aria-label="Asiento {label} libre/ocupado/bloqueado/seleccionado"` que es estable. |
| **`cy.verificarAPI()` en `before()`** | Falla rápido si Render está caído o dormido, con un mensaje claro en vez de timeouts genéricos. |
| **Timeout de 10s en selectores críticos** | Cumple la Observación 3: el primer hit a Render free tras 15 min de inactividad puede tardar. |
| **`{ failOnStatusCode: false }` en commands** | Permite validar respuestas de error (409, 422) en specs negativos sin que Cypress aborte. |
| **Email/DNI aleatorios por test** | Evita conflictos de unicidad (`uq_usuarios_email_lower`) entre specs consecutivos, replicando el patrón de idempotencia del backend. |

## 📝 Selectores clave (mapa de referencia rápida)

| Vista | Selector | Origen |
|---|---|---|
| Búsqueda (origen) | `input[placeholder*="ciudad de salida" i]` | `SearchBar.jsx:48` |
| Búsqueda (destino) | `input[placeholder*="ciudad de destino" i]` | `SearchBar.jsx:56` |
| Búsqueda (fecha) | `input[type="date"]` (con `aria-label="Fecha de Salida"`) | `SearchBar.jsx:60-77` |
| Búsqueda (submit) | `button:contains("Buscar Buses")` | `SearchBar.jsx:84-93` |
| Autocomplete dropdown | `ul[role="listbox"] > li[role="option"]` | `Autocomplete.jsx:140-170` |
| Card de bus (desktop) | `button:contains("Elegir Asientos")` | `BusCardDesktop.jsx:128-142` |
| Mapa de asientos (cargado) | `[aria-label="Frente del bus"]` | `SeatSelectionPage.jsx:321` |
| Asiento libre | `button[aria-label^="Asiento"][aria-label$="libre"]` | `SeatSelectionPage.jsx:248-254` |
| Asiento seleccionado | `button[aria-label$="seleccionado"]` | `SeatSelectionPage.jsx:248-254` |
| Asiento ocupado (no clickeable) | `button[aria-label$="ocupado"]` | `SeatSelectionPage.jsx:248-254` |
| Timer de reserva | `[aria-label*="Tiempo restante"]` | `SeatSelectionPage.jsx:18-36` |

## 🔄 Próximos pasos sugeridos

1. **Pipeline CI**: añadir un job de GitHub Actions que corra `pytest tests/api` y `cypress run --headless` en cada PR.
2. **Visual regression**: integrar `cypress-image-snapshot` para detectar cambios visuales no intencionales en las cards de bus.
3. **API contract testing**: añadir [Schemathesis](https://schemathesis.readthedocs.io/) para fuzzing del OpenAPI schema generado por FastAPI.
4. **Tests de carga**: con `locust` o `k6`, apuntando al endpoint `/v1/travels/search` (el más caliente).
5. **Fix del `validation_exception_handler`** en `app/main.py:87`: usar `jsonable_encoder(exc.errors())` para resolver el bug de serialización de `ValueError` en el ctx de Pydantic.
