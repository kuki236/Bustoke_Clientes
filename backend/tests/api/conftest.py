"""
Fixtures compartidas para la suite de API (`backend/tests/api`).

Diseño de idempotencia:
------------------------
Cada test que necesite persistencia usa la fixture `db_session`, que se
monta sobre una conexión SQLAlchemy contra la base de datos PostgreSQL
local `bustoke_test`. Al iniciar cada test se ejecuta
`TRUNCATE ... RESTART IDENTITY CASCADE` sobre las 30 tablas del esquema
para garantizar que los tests sean independientes y no acumulen filas
de ejecuciones anteriores (sin esto, las restricciones de unicidad
`uq_usuarios_email_lower` y `uq_pasajeros_numero_documento` rompen los
segundos runs).

Adicionalmente:
- `engine` y `session_factory` se crean UNA vez por sesión de pytest
  (`scope="session"`) y se eliminan al final, evitando fugas de
  conexiones PostgreSQL.
- `client` sobrescribe `app.dependency_overrides[get_db]` para que el
  código de la aplicación use el mismo engine (las inserciones que
  hace `db_session` son visibles para la API y viceversa, ya que
  PostgreSQL es persistente y todas las sesiones del test comparten
  la misma BD).
- `app.dependency_overrides.clear()` se ejecuta siempre, aunque el
  test lance excepciones, para no contaminar otros módulos.
- RATE_LIMIT_ENABLED se setea en 'false' al inicio para que el
  limiter de slowapi NO bloquee las requests de pytest (todas
  comparten la key 'testclient' y se activarían los límites).
- HOLD_CLEANUP_DISABLED se setea en 'true' para que el job de
  background en `app/main.py::lifespan` no interfiera con el
  TRUNCATE de cada test.
"""

import datetime as dt
import os
from decimal import Decimal
from typing import Iterator

# Desactivar rate limiting ANTES de cualquier import que
# pueda evaluar los decorators @limiter.limit(...) de los routers.
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
# Desactivar el job de limpieza de holds en la suite de tests.
# Si quedara activo, su asyncio task intentaría abrir conexiones
# sobre la BD transaccional de pytest (que se rollbackea) y
# alargaría el teardown de TestClient. Los tests que validan el
# job lo activan explícitamente con monkeypatch.
os.environ.setdefault("HOLD_CLEANUP_DISABLED", "true")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

# Importa todos los modelos para que se registren en Base.metadata
import app.models  # noqa: F401
from app.core.database import Base, get_db
from app.main import app
from app.models import (
    Agencia,
    Asiento,
    Bus,
    Departamento,
    Distrito,
    Pasajero,
    Provincia,
    Ruta,
    TarifaRuta,
    Terminal,
    TipoDocumento,
    Usuario,
    Viaje,
)


# ============================================================================
# ENGINE / SESSION — compartidos a nivel de sesión de pytest
# ============================================================================

# Conexión hardcoded a la BD de tests local (PostgreSQL 18).
# Si en el futuro se quiere apuntar a otra instancia, exportar
# TEST_DATABASE_URL en el entorno antes de invocar pytest.
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+psycopg2://postgres:portugal@localhost:5432/bustoke_test",
)


@pytest.fixture(scope="session")
def engine():
    """
    Engine PostgreSQL contra `bustoke_test`. Se usa `NullPool` para
    que cada conexión se abra y cierre por uso (evita bloqueos con
    sesiones concurrentes en el mismo proceso de pytest).
    """
    eng = create_engine(
        TEST_DATABASE_URL,
        poolclass=NullPool,
        pool_pre_ping=True,
        future=True,
    )
    yield eng
    eng.dispose()


@pytest.fixture(scope="session")
def session_factory(engine):
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


# ============================================================================
# LIMPIEZA POR TEST — TRUNCATE CASCADE + reinserción de catálogos
# ============================================================================

# Orden inverso de dependencias FK para TRUNCATE ... CASCADE.
# (CASCADE resuelve las dependencias, pero tener la lista explícita
# permite TRUNCATE selectivo si fuera necesario en el futuro).
_TRUNCATE_TABLES = [
    "audit_logs",
    "manifiestos_sutran",
    "mensajes_reclamo",
    "reclamos",
    "tickets_soporte",
    "reembolsos",
    "pagos",
    "boletos",
    "bloqueos_temporales",
    "historial_estados_viaje",
    "viajes",
    "tarifas_ruta",
    "rutas",
    "asientos",
    "buses",
    "choferes",
    "agencias_terminales",
    "terminales",
    "distritos",
    "provincias",
    "departamentos",
    "liquidaciones_agencia",
    "suscripciones",
    "planes",
    "configuracion_comisiones",
    "api_keys",
    "usuarios",
    "pasajeros",
    "tipos_documento",
    "agencias",
]


@pytest.fixture
def db_session(engine) -> Iterator[Session]:
    """
    Sesión SQLAlchemy por test. Antes de ceder el control, vacía
    las 30 tablas con `TRUNCATE ... RESTART IDENTITY CASCADE` y
    re-siembra el catálogo mínimo de `TipoDocumento` (DNI), que es
    el ÚNICO catálogo requerido por el endpoint público
    `/v1/auth/register` y que el código de la app NO crea solo.

    La geografía (Departamentos/Provincias/Distritos) la siembra
    cada test que la necesite (a través de `seed_basico` o de
    fixtures equivalentes), con `INSERT ... ON CONFLICT DO NOTHING`
    para idempotencia.

    Estrategia:
    1. Abrir una conexión fresca del engine (NullPool ⇒ sin
       reutilización con la app).
    2. Truncar todas las tablas en una transacción autocommiteada.
    3. Insertar el DNI como catálogo base y commitear.
    4. Exponer la `Session` al test. La conexión se mantiene abierta
       durante todo el test para que `client` la reuse.
    5. Al finalizar el test, cerrar la sesión y la conexión.

    Si un test hace `db_session.commit()` durante su ejecución, los
    cambios persisten y serán truncados por el siguiente test.
    """
    connection = engine.connect()
    session = Session(bind=connection, autoflush=False, expire_on_commit=False)
    try:
        # 1) TRUNCATE todo
        tables_csv = ", ".join(_TRUNCATE_TABLES)
        session.execute(
            text(f"TRUNCATE TABLE {tables_csv} RESTART IDENTITY CASCADE")
        )
        session.commit()

        # 2) Re-siembra de catálogo base: TipoDocumento DNI.
        # Es lo único que necesita `/v1/auth/register` para resolver
        # el string "DNI" → `id_tipo_documento`. La geografía, agencias,
        # buses, etc. las siembra cada test que las necesite.
        session.add(TipoDocumento(nombre="DNI", longitud_exacta=8))
        session.commit()

        yield session
    finally:
        session.close()
        connection.close()


# ============================================================================
# CLIENTE FASTAPI — reutiliza la conexión de `db_session`
# ============================================================================

@pytest.fixture
def client(db_session) -> Iterator[TestClient]:
    """
    Cliente HTTP de FastAPI que REUTILIZA la misma conexión de la
    sesión `db_session` del test.

    Esto es CRÍTICO: con PostgreSQL, dos conexiones distintas ven
    los commits de la otra (READ COMMITTED), pero el mapa de
    identidad de SQLAlchemy se mantiene por sesión. Si la sesión
    de la API y la de `db_session` son distintas, los objetos
    sembrados por el test pueden no ser visibles para la app, y
    los inserts que hace la app no refrescan el identity map del
    test (lo que rompe aserciones tipo `db_session.query(...)`).

    Al compartir conexión:
    - Una sola transacción implícita por request.
    - Los datos sembrados por `db_session` son inmediatamente
      visibles para los queries de la app.
    - Los commits de la app se ven en `db_session` tras un
      `expire_all()` o un nuevo query.
    """

    def override_get_db() -> Iterator[Session]:
        # Reutilizamos la sesión `db_session` (misma conexión).
        # Antes del yield, nos aseguramos de que NO haya una
        # transacción abierta, porque algunos servicios de la app
        # usan `with self.db.begin():` (context manager) que
        # falla con `InvalidRequestError: A transaction is
        # already begun on this Session` si la sesión ya tiene
        # una transacción implícita abierta.
        if db_session.in_transaction():
            db_session.commit()
        db_session.expire_all()
        try:
            yield db_session
        finally:
            # Tras la request, cerramos cualquier transacción que
            # haya dejado la app para que el test pueda seguir
            # operando.
            if db_session.in_transaction():
                db_session.commit()
            db_session.expire_all()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


# ============================================================================
# SEMILLA DE CATÁLOGO — agencia + bus + viaje
# ============================================================================

@pytest.fixture
def seed_basico(db_session):
    """
    Siembra geografía + agencia + bus con 5 asientos + viaje para mañana.

    Devuelve un dict con IDs primitivos (no objetos ORM) para evitar
    el `DetachedInstanceError` al cerrar la sesión.

    IMPORTANTE: ahora vive dentro del ciclo de vida de `db_session`
    (PostgreSQL real), por lo que las inserciones PERSISTEN durante
    el test. El `TRUNCATE` automático al inicio de cada test garantiza
    idempotencia entre runs consecutivos.
    """

    def _seed():
        # --- Geografía (idempotente: ON CONFLICT DO NOTHING) ---
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        deptos = [
            {"id_departamento": 1, "nombre": "Lima"},
            {"id_departamento": 2, "nombre": "La Libertad"},
        ]
        db_session.execute(
            pg_insert(Departamento).values(deptos).on_conflict_do_nothing()
        )
        db_session.flush()

        provs = [
            {"id_provincia": 1, "id_departamento": 1, "nombre": "Lima"},
            {"id_provincia": 2, "id_departamento": 2, "nombre": "Trujillo"},
        ]
        db_session.execute(
            pg_insert(Provincia).values(provs).on_conflict_do_nothing()
        )
        db_session.flush()

        dists = [
            {"id_distrito": 1, "id_provincia": 1, "nombre": "La Victoria"},
            {"id_distrito": 5, "id_provincia": 2, "nombre": "Trujillo"},
        ]
        db_session.execute(
            pg_insert(Distrito).values(dists).on_conflict_do_nothing()
        )
        db_session.flush()

        # --- Agencia ---
        agencia = Agencia(
            ruc="20100234561",
            razon_social="CRUZ DEL SUR S.A.C.",
            estado="activa",
        )
        db_session.add(agencia)
        db_session.flush()

        # --- Terminales ---
        t_origen = Terminal(
            id_distrito=1, nombre="Terminal Lima Centro", direccion="Av. Javier Prado 1109"
        )
        t_destino = Terminal(
            id_distrito=5, nombre="Terminal Trujillo", direccion="Panamericana Norte Km 558"
        )
        db_session.add_all([t_origen, t_destino])
        db_session.flush()

        # --- Ruta ---
        ruta = Ruta(
            id_agencia=agencia.id_agencia,
            id_terminal_origen=t_origen.id_terminal,
            id_terminal_destino=t_destino.id_terminal,
            tarifa_base=Decimal("70.00"),
        )
        db_session.add(ruta)
        db_session.flush()

        # --- Tarifas (necesarias para filtros de precio) ---
        db_session.add_all([
            TarifaRuta(id_ruta=ruta.id_ruta, tipo_servicio="normal", precio=Decimal("75.00")),
            TarifaRuta(id_ruta=ruta.id_ruta, tipo_servicio="vip", precio=Decimal("110.00")),
        ])
        db_session.flush()

        # --- Bus con 5 asientos (formato 'X1-1' compatible con regex CHECK) ---
        bus = Bus(id_agencia=agencia.id_agencia, placa="ABC-123", cantidad_pisos=1)
        db_session.add(bus)
        db_session.flush()

        for i, letra in enumerate(["A", "B", "C", "D", "E"]):
            db_session.add(Asiento(
                id_bus=bus.id_bus,
                numero_asiento=f"{letra}1-1",
                fila=letra,
                piso=1,
                tipo_servicio="normal",
                coord_x=(i + 1) * 20,
                coord_y=30,
                bloqueado_manual=False,
            ))
        db_session.flush()

        # --- Viaje para mañana a las 08:00 ---
        fecha_salida_date = dt.date.today() + dt.timedelta(days=1)
        manana = dt.datetime.combine(fecha_salida_date, dt.time(8, 0))
        viaje = Viaje(
            id_ruta=ruta.id_ruta,
            id_bus=bus.id_bus,
            fecha_hora_salida=manana,
            fecha_hora_llegada=manana + dt.timedelta(hours=8),
            estado="programado",
            rampa_embarque="Rampa 3",
        )
        db_session.add(viaje)
        db_session.commit()

        return {
            "id_agencia": agencia.id_agencia,
            "id_terminal_origen": t_origen.id_terminal,
            "id_terminal_destino": t_destino.id_terminal,
            "id_ruta": ruta.id_ruta,
            "id_bus": bus.id_bus,
            "id_viaje": viaje.id_viaje,
            "total_asientos": 5,
            "fecha_salida": fecha_salida_date.isoformat(),
        }

    return _seed


# ============================================================================
# HELPERS DE AUTENTICACIÓN
# ============================================================================

@pytest.fixture
def registrar_usuario(client):
    """
    Devuelve una función que registra un pasajero y retorna sus
    credenciales + token. Cada llamada genera un email único para
    evitar colisiones de unicidad.
    """

    def _registrar(suffix: str | None = None) -> dict:
        suffix = suffix or dt.datetime.now().strftime("%H%M%S%f")
        payload = {
            "nombres": "Test",
            "apellido_paterno": "User",
            "apellido_materno": "Cypress",
            "tipo_documento": "DNI",
            "numero_documento": f"7{suffix[-7:].zfill(7)}",
            "telefono": "987654321",
            "email": f"test.{suffix}@bustoke-test.com",
            "contrasena": "TestPass123!",
        }
        r = client.post("/v1/auth/register", json=payload)
        assert r.status_code == 201, r.text
        body = r.json()
        return {
            "payload": payload,
            "access_token": body["access_token"],
            "refresh_token": body["refresh_token"],
            "id_usuario": body["usuario"]["id_usuario"],
        }

    return _registrar


@pytest.fixture
def auth_headers(registrar_usuario):
    """
    Retorna un dict con el header `Authorization: Bearer ...` listo
    para pasarse a `client.get/post(..., headers=...)`.
    """
    usuario = registrar_usuario()
    return {"Authorization": f"Bearer {usuario['access_token']}"}, usuario
