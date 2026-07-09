# 🚀 Setup de Pruebas E2E en Local — Paso a Paso

Guía para correr las pruebas en tu máquina (Windows + pgAdmin 4 + PostgreSQL local).

---

## Pre-requisitos (verificar una sola vez)

| Herramienta | Versión esperada | Cómo verificar |
|---|---|---|
| Python | 3.11+ | `python --version` |
| Node.js | 22+ | `node --version` |
| npm | 10+ | `npm --version` |
| PostgreSQL | 14+ | `psql --version` (en pgAdmin 4 ya viene) |
| pgAdmin 4 | cualquiera | Abrir desde el menú inicio |
| Git | cualquiera | `git --version` |

---

## Paso 1: Verificar/crear el venv de Python

```powershell
cd C:\Users\sebas\Desktop\sebas\repos\Bustoke_Clientes\backend

# Si no existe el venv, créalo
python -m venv venv
.\venv\Scripts\Activate.ps1

# Instalar dependencias
pip install -r requirements.txt

# Verificar pytest
pytest --version
```

✅ Esperado: `pytest 9.0.3`

---

## Paso 2: Verificar/crear el node_modules del frontend

```powershell
cd C:\Users\sebas\Desktop\sebas\repos\Bustoke_Clientes\frontend-client

# Si no está instalado
npm install

# Verificar Cypress
npx cypress --version
```

✅ Esperado: `Cypress 14.5.x`

---

## Paso 3: Setup de la Base de Datos (pgAdmin 4)

### 3.1. Crear la BD `bustoke_test`

1. Abre **pgAdmin 4**.
2. Conéctate a tu servidor local (PostgreSQL 18, usuario `postgres`, contraseña `portugal`).
3. Click derecho en **Databases** → **Create** → **Database...**
4. Configura:
   - **Database**: `bustoke_test`
   - **Owner**: `postgres`
5. Click **Save**.

### 3.2. Cargar el schema

1. Click en la BD `bustoke_test` recién creada.
2. Menú **Tools** → **Query Tool**.
3. **File** → **Open** → selecciona `C:\Users\sebas\Desktop\sebas\repos\Bustoke_Clientes\backend\scripts\bustoke_bd.sql`.
4. Click en el botón **Execute/Refresh** (▶️ o F5).
5. Espera a que termine (~5s). Verás `Successfully run. Total query time: ...`.

### 3.3. (Alternativa) Crear BD y cargar schema con un solo script

Si tienes `psql` en PATH, en una terminal PowerShell:

```powershell
$env:PGPASSWORD = "portugal"
psql -U postgres -h localhost -c "CREATE DATABASE bustoke_test;"
psql -U postgres -h localhost -d bustoke_test -f C:\Users\sebas\Desktop\sebas\repos\Bustoke_Clientes\backend\scripts\bustoke_bd.sql
```

---

## Paso 4: Sembrar el dataset E2E

### Opción A — pgAdmin 4 (recomendado si psycopg2 falla en tu Windows)

1. En pgAdmin 4, click en la BD `bustoke_test`.
2. Menú **Tools** → **Query Tool**.
3. **File** → **Open** → selecciona `C:\Users\sebas\Desktop\sebas\repos\Bustoke_Clientes\backend\scripts\seed_e2e.sql`.
4. Click en **Execute** (▶️) o F5.
5. Espera ~3s. Verás mensajes `TRUNCATE`, `INSERT 0 3`, etc., y 11 `SELECT setval` al final.

### Opción B — Script Python (si psycopg2 funciona en tu máquina)

Vuelve a la terminal donde activaste el venv (Paso 1):

```powershell
cd C:\Users\sebas\Desktop\sebas\repos\Bustoke_Clientes\backend

# Crear/actualizar un .env temporal para el seed
@"
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bustoke_test
DB_USER=postgres
DB_PASSWORD=portugal
PYTHONIOENCODING=utf-8
PYTHONUTF8=1
"@ | Out-File -Encoding utf8 .env

# Ejecutar el seed
python scripts\seed_e2e.py

# Limpiar el .env temporal (no comitearlo)
Remove-Item .env
```

✅ Esperado (Opción A en pgAdmin):
```
TRUNCATE TABLE
INSERT 0 3
INSERT 0 2
...
INSERT 0 1
 setval
--------
      4
...
 setval
--------
      2
```

✅ Esperado (Opción B con Python):
```
[seed_e2e] Conectando a localhost:5432/bustoke_test
[seed_e2e] Tablas truncadas.
[seed_e2e] Dataset insertado: {...}
[seed_e2e] Secuencias SERIAL reajustadas.
```

---

## Paso 5: Levantar el Backend (Terminal 1)

Abre una **terminal nueva** (PowerShell o cmd):

```powershell
cd C:\Users\sebas\Desktop\sebas\repos\Bustoke_Clientes\backend
.\venv\Scripts\Activate.ps1

# Crear .env de dev (una sola vez, no commitear)
@"
APP_ENV=development
APP_DEBUG=true
SECRET_KEY=local-dev-secret-key-not-for-production-change-me
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bustoke_test
DB_USER=postgres
DB_PASSWORD=portugal
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
RATE_LIMIT_ENABLED=false
HOLD_CLEANUP_DISABLED=true
SMTP_HOST=
"@ | Out-File -Encoding utf8 .env

# Levantar uvicorn
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

✅ Esperado: `Uvicorn running on http://127.0.0.1:8000`

**Verificación rápida** (en otra terminal):
```powershell
curl http://127.0.0.1:8000/health
# Esperado: {"status":"healthy"}
```

---

## Paso 6: Levantar el Frontend (Terminal 2)

Abre **otra terminal nueva**:

```powershell
cd C:\Users\sebas\Desktop\sebas\repos\Bustoke_Clientes\frontend-client
npm run dev
```

✅ Esperado: `Local: http://localhost:5173/`

---

## Paso 7: Correr las pruebas

### Opción A: Solo pytest del backend (rápido, ~100s)

En una **tercera terminal** (con el venv activado):

```powershell
cd C:\Users\sebas\Desktop\sebas\repos\Bustoke_Clientes\backend
pytest tests/ -v
```

✅ Esperado: `118 passed`.

### Opción B: Cypress con navegador (interactivo)

En una **cuarta terminal**:

```powershell
cd C:\Users\sebas\Desktop\sebas\repos\Bustoke_Clientes\frontend-client
npm run cy:open
```

Selecciona un spec (ej. `01-busqueda-viajes.cy.js`) en la GUI de Cypress y mira el navegador.

### Opción C: Cypress headless (CI-like)

```powershell
cd C:\Users\sebas\Desktop\sebas\repos\Bustoke_Clientes\frontend-client
npm run cy:run
```

---

## Resumen de terminales

| Terminal | Comando | Para qué |
|---|---|---|
| **T1** | `cd backend && uvicorn app.main:app --reload` | Backend (puerto 8000) |
| **T2** | `cd frontend-client && npm run dev` | Frontend (puerto 5173) |
| **T3** | `cd backend && pytest tests/ -v` | Tests pytest |
| **T4** | `cd frontend-client && npm run cy:open` | Tests Cypress (opcional) |

---

## Comandos útiles

| Acción | Comando |
|---|---|
| Ver logs del backend en tiempo real | La terminal T1 los muestra |
| Ver logs de Cypress | Después de `cy:run`, están en `frontend-client/cypress/videos/` y `screenshots/` |
| Resetear la BD con datos frescos | Repetir Paso 4 |
| Ver health del backend | `curl http://127.0.0.1:8000/health` |
| Ver health del frontend | Abrir `http://localhost:5173/` en el navegador |

---

## Troubleshooting

### "Puerto 8000/5173 ya está en uso"
```powershell
# Matar procesos en esos puertos
netstat -ano | findstr :8000
taskkill /F /PID <PID>

netstat -ano | findstr :5173
taskkill /F /PID <PID>
```

### "ModuleNotFoundError: No module named 'app'"
Asegúrate de estar en el directorio `backend/` y con el venv activado:
```powershell
cd backend
.\venv\Scripts\Activate.ps1
```

### "could not translate host name 'postgres'"
El backend no encuentra la BD. Verifica el `.env` del backend:
```powershell
cd backend
type .env
# DB_HOST debe ser localhost
```

### Cypress no encuentra elementos
Verifica que el backend y frontend estén corriendo y respondan (Paso 5 y 6).
Luego recarga la página con Ctrl+R en el navegador de Cypress.

---

## Credenciales usadas

| Servicio | Usuario | Contraseña |
|---|---|---|
| PostgreSQL local | `postgres` | `portugal` |
| BD `bustoke_test` | (heredada de `postgres`) | (heredada) |
| Backend (credenciales dummy) | n/a | n/a |
| Frontend | n/a | n/a |
