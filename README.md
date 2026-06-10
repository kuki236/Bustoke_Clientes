# Bustoke — Plataforma de Reservas y Operación de Buses

Monorepo del proyecto **BUSTOKE**, una plataforma que conecta a pasajeros (B2C) con múltiples agencias de transporte interprovincial (B2B), incluyendo búsqueda, selección de asientos, emisión de boletos con QR, pagos, reclamos y operación interna de la agencia.

## Estructura del repositorio

```
Bustoke_Clientes/
├── backend/                # API REST en FastAPI (Python 3.11+)
├── frontend-client/        # Web pública del pasajero (React + Vite + Tailwind)
└── bustoke_bd.sql          # Dump de la base de datos PostgreSQL
```

| Carpeta | Stack | Descripción |
| --- | --- | --- |
| `backend/` | Python 3.11, FastAPI, SQLAlchemy 2, PostgreSQL, JWT | API REST versionada (`/v1`). Cubre auth B2C, búsqueda de viajes, hold/release de asientos, checkout/boletos, perfil de agencia, reclamos y plataforma de comisiones. |
| `frontend-client/` | React 19, Vite, TailwindCSS 4, Axios, React Router 7 | SPA orientada al pasajero: landing, búsqueda, selección de asientos, checkout, login/registro, mis viajes, perfil, reclamos. |
| `bustoke_bd.sql` | PostgreSQL | Esquema completo de la base de datos (modelo relacional + enums + vista `vw_estado_asientos_viaje`). |

## Stack tecnológico

### Backend
- **FastAPI 0.136** + **Uvicorn** — framework ASGI y servidor de desarrollo.
- **SQLAlchemy 2.0** + **psycopg2-binary** — ORM y driver PostgreSQL.
- **Pydantic 2** + **pydantic-settings** — validación y carga de configuración desde `.env`.
- **python-jose** + **passlib/bcrypt** — JWT y hashing de contraseñas.
- **httpx** — cliente HTTP (utilidades internas / health checks).
- **pytest** — tests.

### Frontend
- **React 19.2** + **Vite 8** + **@vitejs/plugin-react 6**.
- **TailwindCSS 4** (plugin `@tailwindcss/vite`).
- **React Router 7** para navegación SPA.
- **Axios** con interceptores para JWT y normalización de errores.
- **lucide-react** para iconografía.
- **ESLint 10** con presets para React Hooks y React Refresh.

## Características implementadas

### Backend (`/v1`)

| Módulo | Endpoints | Estado | Requerimiento |
| --- | --- | --- | --- |
| **Auth** | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me` | Implementado | RF-01, RF-02 |
| **Travels** | `GET /travels/search`, `GET /travels/{id}`, `GET /travels/{id}/seats`, `GET /travels/{id}/manifiesto` | Implementado / Stub | RF-03, RF-04, RF-05, RF-11, RF-17 |
| **Seats** | `POST /seats/hold`, `POST /seats/release`, `POST /seats/checkout` | Implementado / Stub | RF-05, RF-07, RF-08 |
| **Bookings** | `POST /bookings/process` | Implementado (transacción atómica) | RF-07 |
| **Agencies (B2B)** | `/agencies/me`, `/agencies/buses`, `/agencies/routes`, `/agencies/api-keys`, `/agencies/reports`, `/agencies/inventory`, `/agencies/inventory/lock` | Stubs | RF-12 a RF-21, RF-25 |
| **Claims** | `/claims/`, `/claims/me`, `/claims/{id}`, `/claims/{id}/messages`, `/claims/{id}/respond` | Stubs | RF-09, RF-10, RF-19 |
| **Billing** | `/billing/commissions`, `/billing/subscriptions`, `/billing/settlements` | Stubs | RF-22 a RF-25 |

Características clave del backend ya operativas:
- **Configuración centralizada** con `pydantic-settings` (`app/core/config.py`) y variables de entorno (`.env.example` incluido).
- **CORS** configurado para `localhost:3000`, `5173` y `127.0.0.1:3000` por defecto.
- **Manejo global de errores de validación** (`RequestValidationError`) con payload legible.
- **Health check** en `GET /` y `GET /health`.
- **Documentación OpenAPI** en `/docs` y `/redoc` (solo en modo debug).
- **Pooling de conexiones** con SQLAlchemy (`pool_size`, `max_overflow`, `pool_timeout`).
- **Hashing de contraseñas** con bcrypt.
- **Bloqueo temporal de asientos** (`SEAT_HOLD_TTL_SECONDS = 600s` por defecto).
- **Modelo de datos relacional** completo: usuarios, pasajeros, agencias, buses, rutas, terminales, provincias, distritos, viajes, asientos, boletos, bloqueos temporales, pagos, reclamos, manifiestos SUTRAN, liquidaciones, suscripciones, planes, comisiones, API Keys B2B, auditoría.

### Frontend — Cliente

| Pantalla / Flujo | Componente | Estado |
| --- | --- | --- |
| Landing con buscador | `LandingPage`, `Hero`, `SearchBar`, `SearchField`, `DestinationCarousel`, `BenefitsSection`, `FaqSection` | Implementado |
| Resultados de búsqueda | `ResultsPage`, `FilterSidebar`, `BusCardDesktop`, `BusCardMobile`, `ResultsMobileHeader` | Implementado (consume `/v1/travels/search`) |
| Selección de asientos | `SeatSelectionPage` (multi-piso, hold/release, countdown) | Implementado (consume `/v1/travels/{id}/seats`, `/v1/seats/hold`, `/v1/seats/release`) |
| Checkout | `CheckoutPage` (pasajeros, métodos de pago) | Implementado (consume `/v1/bookings/process`) |
| Confirmación | `CheckoutSuccessPage` | Implementado |
| Autenticación | `LoginPage`, `RegisterPage`, `AuthContext` | Implementado (consume `/v1/auth/*`) |
| Mis viajes | `HistoryPage`, `ConfirmationPage` | Implementado |
| Perfil | `ProfilePage` | Implementado |
| Reclamos | `ClaimsPage` | Implementado (UI, endpoint stub) |
| Mapa guiado de ruta | `GuidedRouteMap` | Implementado |
| Steppers y utilidades | `PassengerStepper`, `Alert`, `Autocomplete`, `MobileHeader`, `MobileSearchCard`, `BottomNav` | Implementado |

Características del frontend:
- **Cliente HTTP centralizado** (`api/axiosInstance.js`) con interceptor de Authorization Bearer y normalización de mensajes de error a `ApiError` con `status` y `original`.
- **Token de sesión por pestaña** (`sessionStorage` `bustoke_seat_session_token`) para que los holds de asientos no colisionen entre pestañas.
- **Rehidratación automática de sesión** al montar `AuthProvider` si hay token en `localStorage`.
- **Normalización de datos** entre backend (snake_case) y frontend (camelCase) en `api/auth.js` y `api/travels.js`.
- **Diseño responsive** mobile-first con TailwindCSS 4 y tokens de tema (`theme-tokens.json`).
- **Datos mock** en `src/data/` (terminales, agencias, trips, tipos de documento, historial) para desarrollo sin backend.

## Configuración del entorno

### 1. Base de datos

```bash
# Crear la base de datos
psql -U postgres -c "CREATE DATABASE bustoke_db;"

# Cargar el esquema
psql -U postgres -d bustoke_db -f bustoke_bd.sql
```

El script crea todas las tablas, enums y la vista `vw_estado_asientos_viaje` usada para el mapa de asientos en tiempo real.

### 2. Backend

```bash
cd backend

# Crear entorno virtual
python -m venv venv
.\venv\Scripts\activate         # Windows
# source venv/bin/activate      # Linux / macOS

# Instalar dependencias
pip install -r requirements.txt

# Configurar variables de entorno
copy .env.example .env          # Windows
# cp .env.example .env          # Linux / macOS
# Editar .env con sus credenciales

# Levantar el servidor de desarrollo
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Documentación interactiva: `http://localhost:8000/docs`

Variables de entorno relevantes (ver `backend/.env.example`):

| Variable | Descripción | Default |
| --- | --- | --- |
| `APP_ENV` / `APP_DEBUG` | Entorno y modo debug | `development` / `True` |
| `APP_HOST` / `APP_PORT` | Host/puerto del servidor | `0.0.0.0` / `8000` |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | Conexión PostgreSQL | `localhost` / `5432` / `bustoke_db` / `postgres` / `postgres` |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` / `DB_POOL_TIMEOUT` | Tuning del pool | `10` / `20` / `30` |
| `DB_ECHO_SQL` | Log de SQL en stdout | `False` |
| `SECRET_KEY` | Clave JWT (rotar en producción) | `change_me_in_production` |
| `JWT_ALGORITHM` | Algoritmo JWT | `HS256` |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Expiración access token | `60` |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | Expiración refresh token | `7` |
| `JWT_API_KEY_EXPIRE_DAYS` | Expiración API Key B2B | `365` |
| `CORS_ORIGINS` | Orígenes permitidos (CSV) | `http://localhost:3000,http://localhost:5173,...` |
| `SEAT_HOLD_TTL_SECONDS` | TTL del bloqueo temporal de asientos | `600` |

### 3. Frontend

```bash
cd frontend-client
npm install
npm run dev
```

Servidor de desarrollo: `http://localhost:5173` (Vite).

El `baseURL` del cliente HTTP está configurado en `src/api/axiosInstance.js` apuntando a `http://localhost:8000/v1`. Ajustar si el backend corre en otro host/puerto.

## Modelo de datos (resumen)

Entidades principales definidas en `backend/app/models/`:

- **Usuarios y pasajeros**: `Usuario`, `Pasajero`, `TipoDocumento`, con enums `rol_usuario_enum` (`cliente`, `admin_agencia`, `superadmin`).
- **Geografía**: `Departamento`, `Provincia`, `Distrito`, `Terminal`, `AgenciaTerminal`.
- **Catálogo de agencia**: `Agencia`, `Plan`, `Suscripcion`, `ConfiguracionComision`, `LiquidacionAgencia`, `ApiKey`, `TicketSoporte`.
- **Operación**: `Bus`, `Asiento`, `Ruta`, `TarifaRuta`, `Viaje`, `HistorialEstadoViaje`, `BloqueoTemporal`.
- **Venta**: `Boleto`, `Pago`, `Reembolso`, con enums `estado_boleto_enum`, `estado_pago_enum`, `metodo_pago_enum`, `canal_venta_enum`, `tipo_servicio_enum`.
- **Post-venta**: `Reclamo`, `MensajeReclamo`, `ManifiestoSutran`, `AuditLog`.

## Endpoints — Referencia rápida

```
GET    /                              # Info de la API
GET    /health                        # Health check
GET    /docs                          # Swagger UI (solo en debug)
GET    /redoc                         # ReDoc (solo en debug)

# Auth
POST   /v1/auth/register              # Registro de pasajero B2C
POST   /v1/auth/login                 # Login email + contraseña
POST   /v1/auth/refresh               # Renueva access token
GET    /v1/auth/me                    # Perfil del usuario autenticado

# Travels
GET    /v1/travels/search             # Búsqueda por origen/destino/fecha + filtros
GET    /v1/travels/{id_viaje}         # Detalle del viaje
GET    /v1/travels/{id_viaje}/seats   # Mapa de asientos en tiempo real
GET    /v1/travels/{id_viaje}/manifiesto  # Manifiesto SUTRAN (stub)

# Seats
POST   /v1/seats/hold                 # Bloqueo temporal de asiento
POST   /v1/seats/release              # Liberar bloqueo
POST   /v1/seats/checkout             # Stub de checkout

# Bookings
POST   /v1/bookings/process           # Procesar compra completa (transacción atómica)

# Agencies (B2B) — todos stub
GET    /v1/agencies/me
GET    /v1/agencies/buses
POST   /v1/agencies/buses
GET    /v1/agencies/routes
POST   /v1/agencies/api-keys
GET    /v1/agencies/reports
GET    /v1/agencies/inventory
POST   /v1/agencies/inventory/lock

# Claims — todos stub
POST   /v1/claims/
GET    /v1/claims/me
GET    /v1/claims/{id_reclamo}
POST   /v1/claims/{id_reclamo}/messages
POST   /v1/claims/{id_reclamo}/respond

# Billing — todos stub
GET    /v1/billing/commissions
POST   /v1/billing/commissions
GET    /v1/billing/subscriptions
GET    /v1/billing/settlements
POST   /v1/billing/settlements
```

## Tests

```bash
cd backend
pytest
```

Los tests viven en `backend/tests/`.

## Convenciones del proyecto

- **Backend**: arquitectura en capas `routers → services → repositories`, con `schemas` Pydantic separados por dominio (`auth`, `travel`, `seat`, `booking`, `user`, `agency`, `claim`, `transaction`, etc.).
- **Frontend**: cada vista/pantalla es un componente en `src/components/`. Las llamadas a la API se centralizan en `src/api/`. Los datos mock están en `src/data/`.
- **Idioma**: documentación y comentarios en español, mensajes de error también en español.
- **Naming**: backend usa `snake_case` (alineado a la BD), frontend usa `camelCase` con normalización en la capa `api/`.

## Próximos pasos

- Implementar los endpoints stub de **Agencies (B2B)**, **Claims** y **Billing**.
- Integrar pasarela de pagos real (Izipay / Culqi / Niubiz) en el flujo de checkout.
- Emisión de **boletos PDF** y reporte SUTRAN automático.
- Panel de administración B2B (frontend-agency).
- Notificaciones (email + push) para confirmaciones y cambios de estado del viaje.
