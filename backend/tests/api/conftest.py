"""
Fixtures compartidas para la suite de API (`backend/tests/api`).

Diseño de idempotencia:
------------------------
Cada test que necesite persistencia usa la fixture `db_session`, que
se monta sobre una conexión SQLAlchemy envuelta en una transacción
externa (`connection.begin()`). Al finalizar el test (`yield`), la
transacción se revierte con `transaction.rollback()`, garantizando
que la base de datos quede en su estado original incluso si el test
falla a mitad de camino. Esto evita por completo errores de unicidad
(`uq_usuarios_email_lower`, `uq_pasajeros_numero_documento`, etc.)
al correr los tests de manera consecutiva.

Adicionalmente:
- `engine` y `session_factory` se crean UNA vez por sesión de pytest
  y se eliminan al final, evitando fugas de conexiones SQLite.
- `client` sobrescribe `app.dependency_overrides[get_db]` para que el
  código de la aplicación use la misma `session_factory` transaccional.
- `app.dependency_overrides.clear()` se ejecuta siempre, aunque el
  test lance excepciones, para no contaminar otros módulos.
- RATE_LIMIT_ENABLED se setea en 'false' al inicio para que el
  limiter de slowapi NO bloquee las requests de pytest (todas
  comparten la key 'testclient' y se activarían los límites).
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
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

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

@pytest.fixture(scope="session")
def engine():
    """
    Engine SQLite in-memory con `StaticPool` para que la conexión
    sea única y reutilizable entre distintos `Session` (de lo
    contrario SQLite crea una BD nueva por cada conexión).
    """
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture(scope="session")
def session_factory(engine):
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


# ============================================================================
# SESIÓN TRANSACCIONAL POR TEST — rollback al finalizar
# ============================================================================

@pytest.fixture
def db_session(engine) -> Iterator[Session]:
    """
    Sesión SQLAlchemy envuelta en una transacción que se revierte al
    final del test. Esto garantiza idempotencia entre tests sin
    requerir `TRUNCATE` ni reinicios de tabla.

    Implementación: usamos una conexión fresca del engine, abrimos
    una transacción manualmente y la revertimos al final. Si el
    código de la app hace `commit()` durante el request, se abre
    un SAVEPOINT en lugar de confirmar la transacción externa
    (gracias al listener `after_transaction_end`).
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, autoflush=False, expire_on_commit=False)

    # Si el código de la aplicación hace `db.commit()` (FastAPI lo hace
    # en cada endpoint vía `get_db`), no queremos que la transacción
    # externa se confirme. Interceptamos `commit` y abrimos un savepoint.
    @event.listens_for(session, "after_transaction_end")
    def _restart_savepoint(sess, trans):
        if trans.nested and not trans._parent.nested:
            sess.expire_all()
            sess.begin_nested()

    try:
        yield session
    finally:
        session.close()
        if transaction.is_active:
            transaction.rollback()
        connection.close()


# ============================================================================
# CLIENTE FASTAPI — usa la sesión transaccional
# ============================================================================

@pytest.fixture
def client(db_session) -> Iterator[TestClient]:
    """
    Cliente HTTP de FastAPI. Cada request abre una sesión SQLAlchemy
    nueva (gracias a `get_db` con yield), pero como SQLite in-memory
    comparte la conexión base del engine, los datos sembrados con
    `db_session` son visibles para la API.
    """

    def override_get_db() -> Iterator[Session]:
        s = Session(bind=db_session.get_bind(), autoflush=False, expire_on_commit=False)
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


# ============================================================================
# SEMILLA DE CATÁLOGO — DNI + geografía + agencia + bus + viaje
# ============================================================================

@pytest.fixture(autouse=True)
def _seed_catalogo_documentos(db_session):
    """
    Siembra el catálogo mínimo de `tipos_documento` requerido por el
    endpoint público `/v1/auth/register`. El flag `autouse=True` hace
    que esté disponible en todos los tests sin tener que declararlo
    explícitamente. La transacción se revierte al final del test, por
    lo que no contamina tests posteriores.
    """
    if not db_session.query(TipoDocumento).filter(TipoDocumento.nombre == "DNI").first():
        db_session.add(TipoDocumento(nombre="DNI", longitud_exacta=8))
        db_session.flush()


@pytest.fixture
def seed_basico(db_session):
    """
    Siembra geografía + agencia + bus con 5 asientos + viaje para mañana.

    Devuelve un dict con IDs primitivos (no objetos ORM) para evitar
    el `DetachedInstanceError` al cerrar la sesión.

    IMPORTANTE: como vive dentro de la transacción de `db_session`,
    el `rollback` automático del final del test la limpia. Esto
    garantiza que correr los tests consecutivamente no genere
    conflictos de unicidad.
    """

    def _seed():
        # --- Geografía ---
        depto_lima = Departamento(id_departamento=1, nombre="Lima")
        depto_la_libertad = Departamento(id_departamento=2, nombre="La Libertad")
        db_session.add_all([depto_lima, depto_la_libertad])
        db_session.flush()

        prov_lima = Provincia(id_provincia=1, id_departamento=1, nombre="Lima")
        prov_trujillo = Provincia(id_provincia=2, id_departamento=2, nombre="Trujillo")
        db_session.add_all([prov_lima, prov_trujillo])
        db_session.flush()

        dist_lima = Distrito(id_distrito=1, id_provincia=1, nombre="La Victoria")
        dist_trujillo = Distrito(id_distrito=5, id_provincia=2, nombre="Trujillo")
        db_session.add_all([dist_lima, dist_trujillo])
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
        db_session.flush()

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
