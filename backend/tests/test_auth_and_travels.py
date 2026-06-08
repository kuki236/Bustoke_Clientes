"""
Test E2E del flujo B2C con SQLite in-memory.

Cubre:
- Registro de pasajero (RF-01)
- Login (RF-02)
- Búsqueda de viajes con JOINs a rutas y terminales (RF-03, RF-04)
- Cálculo de asientos libres en tiempo real (RF-05)
- Filtros dinámicos de búsqueda (precio, agencia, tipo, turno)
- Resolución de búsqueda por ciudad (provincia)
- /me con JWT (RF-02)
- Manejo de errores: email duplicado, credenciales inválidas, etc.
"""

import datetime as dt
from decimal import Decimal
from typing import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
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
# FIXTURES
# ============================================================================

@pytest.fixture
def engine():
    """Crea un engine SQLite in-memory con todas las tablas."""
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def session_factory(engine):
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


@pytest.fixture
def db_session(session_factory) -> Iterator[Session]:
    db = session_factory()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client(session_factory) -> Iterator[TestClient]:
    """Cliente FastAPI con `get_db` sobreescrito a SQLite in-memory."""

    def override_get_db() -> Iterator[Session]:
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def seed(session_factory):
    """Siembra datos mínimos para probar la búsqueda de viajes.

    Devuelve un dict con primitivos (IDs y fechas) para evitar el
    `DetachedInstanceError` al cerrar la sesión de seed.
    """

    def _seed():
        db = session_factory()

        # --- Geografía ---
        tipo_dni = TipoDocumento(nombre="DNI", longitud_exacta=8)
        db.add(tipo_dni)
        db.flush()

        # Departamentos / Provincias / Distritos para soportar la
        # resolución de búsqueda por ciudad (provincia).
        depto_lima = Departamento(id_departamento=1, nombre="Lima")
        depto_trujillo = Departamento(id_departamento=2, nombre="La Libertad")
        db.add_all([depto_lima, depto_trujillo])
        db.flush()

        prov_lima = Provincia(id_provincia=1, id_departamento=1, nombre="Lima")
        prov_trujillo = Provincia(id_provincia=2, id_departamento=2, nombre="Trujillo")
        db.add_all([prov_lima, prov_trujillo])
        db.flush()

        dist_lima = Distrito(id_distrito=1, id_provincia=1, nombre="La Victoria")
        dist_trujillo = Distrito(id_distrito=5, id_provincia=2, nombre="Trujillo")
        db.add_all([dist_lima, dist_trujillo])
        db.flush()

        # --- Agencia ---
        agencia = Agencia(
            ruc="20100234561",
            razon_social="CRUZ DEL SUR S.A.C.",
            estado="activa",
        )
        db.add(agencia)
        db.flush()

        # --- Terminales ---
        t_origen = Terminal(
            id_distrito=1, nombre="Terminal Lima Centro", direccion="Av. Javier Prado 1109"
        )
        t_destino = Terminal(
            id_distrito=5, nombre="Terminal Trujillo", direccion="Panamericana Norte Km 558"
        )
        db.add_all([t_origen, t_destino])
        db.flush()

        # --- Ruta ---
        ruta = Ruta(
            id_agencia=agencia.id_agencia,
            id_terminal_origen=t_origen.id_terminal,
            id_terminal_destino=t_destino.id_terminal,
            tarifa_base=Decimal("70.00"),
        )
        db.add(ruta)
        db.flush()

        # --- Tarifa por servicio para la ruta (necesaria para
        #     verificar el filtro de `precio_min`/`precio_max`).
        tarifa_normal = TarifaRuta(id_ruta=ruta.id_ruta, tipo_servicio="normal", precio=Decimal("75.00"))
        tarifa_vip = TarifaRuta(id_ruta=ruta.id_ruta, tipo_servicio="vip", precio=Decimal("110.00"))
        db.add_all([tarifa_normal, tarifa_vip])
        db.flush()

        # --- Bus con 5 asientos ---
        bus = Bus(
            id_agencia=agencia.id_agencia,
            placa="ABC-123",
            cantidad_pisos=1,
        )
        db.add(bus)
        db.flush()

        for i, letra in enumerate(["A", "B", "C", "D", "E"]):
            a = Asiento(
                id_bus=bus.id_bus,
                numero_asiento=f"{letra}1-1",
                fila=letra,
                piso=1,
                tipo_servicio="normal",
                coord_x=(i + 1) * 20,
                coord_y=30,
                bloqueado_manual=False,
            )
            db.add(a)
        db.flush()

        # --- Viaje programado para mañana ---
        fecha_salida_date = dt.date.today() + dt.timedelta(days=1)
        manana = dt.datetime.combine(fecha_salida_date, dt.time(8, 0))
        llegada = manana + dt.timedelta(hours=8)
        viaje = Viaje(
            id_ruta=ruta.id_ruta,
            id_bus=bus.id_bus,
            fecha_hora_salida=manana,
            fecha_hora_llegada=llegada,
            estado="programado",
            rampa_embarque="Rampa 3",
        )
        db.add(viaje)

        # --- Pasajero semilla (opcional) ---
        pasajero = Pasajero(
            id_tipo_documento=tipo_dni.id_tipo_documento,
            numero_documento="72145639",
            nombres="Carlos",
            apellido_paterno="Mendoza",
            apellido_materno="Quispe",
            fecha_nacimiento=dt.date(1992, 5, 14),
        )
        db.add(pasajero)
        db.commit()

        return {
            "id_agencia": agencia.id_agencia,
            "id_terminal_origen": t_origen.id_terminal,
            "id_terminal_destino": t_destino.id_terminal,
            "id_ruta": ruta.id_ruta,
            "id_bus": bus.id_bus,
            "id_viaje": viaje.id_viaje,
            "id_pasajero": pasajero.id_pasajero,
            "id_tipo_documento": tipo_dni.id_tipo_documento,
            "total_asientos": 5,
            "fecha_salida": fecha_salida_date.isoformat(),
            "terminal_origen_nombre": t_origen.nombre,
            "terminal_destino_nombre": t_destino.nombre,
        }

    return _seed


# ============================================================================
# TESTS - AUTENTICACIÓN
# ============================================================================

def test_register_pasajero_exitoso(client: TestClient):
    """RF-01: Registro de pasajero devuelve 201 + TokenResponse."""
    payload = {
        "email": "carlos.mendoza@example.com",
        "password": "MiPassword123!",
        "telefono": "998765432",
    }
    r = client.post("/v1/auth/register", json=payload)
    assert r.status_code == 201, r.text
    body = r.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0
    assert body["usuario"]["email"] == payload["email"]
    assert body["usuario"]["rol"] == "cliente"  # Enum real de la BD
    assert body["usuario"]["activo"] is True
    assert "password_hash" not in body["usuario"]
    print(f"  register OK: token={body['access_token'][:30]}...")


def test_register_rol_invalido_rechazado(client: TestClient):
    """Solo se permite rol='cliente' en el endpoint público."""
    r = client.post(
        "/v1/auth/register",
        json={
            "email": "admin@x.com",
            "password": "Secret123!",
            "rol": "superadmin",
        },
    )
    assert r.status_code == 403
    assert "cliente" in r.json()["detail"]
    print("  register rechaza rol != 'cliente'")


def test_register_email_duplicado_devuelve_409(client: TestClient):
    """Un segundo registro con el mismo email debe fallar."""
    payload = {"email": "dup@example.com", "password": "Secret123!"}
    r1 = client.post("/v1/auth/register", json=payload)
    assert r1.status_code == 201
    r2 = client.post("/v1/auth/register", json=payload)
    assert r2.status_code == 409
    assert "ya está registrado" in r2.json()["detail"]
    print("  register 409 en duplicado")


def test_register_password_corta_rechazada(client: TestClient):
    r = client.post(
        "/v1/auth/register",
        json={"email": "x@y.com", "password": "123"},
    )
    assert r.status_code == 422
    print("  register 422 con password corta")


def test_register_email_invalido_rechazado(client: TestClient):
    r = client.post(
        "/v1/auth/register",
        json={"email": "no-es-email", "password": "Secret123!"},
    )
    assert r.status_code == 422
    print("  register 422 con email inválido")


def test_login_exitoso_devuelve_jwt(client: TestClient):
    """RF-02: Login con credenciales válidas devuelve JWT."""
    client.post(
        "/v1/auth/register",
        json={"email": "login@x.com", "password": "MiPassword123!"},
    )
    r = client.post(
        "/v1/auth/login",
        json={"email": "login@x.com", "password": "MiPassword123!"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "access_token" in body
    assert "refresh_token" in body
    print(f"  login OK: token={body['access_token'][:30]}...")


def test_login_password_incorrecta_devuelve_401(client: TestClient):
    client.post(
        "/v1/auth/register",
        json={"email": "user@x.com", "password": "Correcta123!"},
    )
    r = client.post(
        "/v1/auth/login",
        json={"email": "user@x.com", "password": "Equivocada123!"},
    )
    assert r.status_code == 401
    assert "Credenciales" in r.json()["detail"]
    print("  login 401 con password incorrecta")


def test_login_email_inexistente_devuelve_401(client: TestClient):
    r = client.post(
        "/v1/auth/login",
        json={"email": "nadie@x.com", "password": "cualquiera"},
    )
    assert r.status_code == 401
    print("  login 401 con email inexistente")


def test_me_con_jwt_valido(client: TestClient):
    """El endpoint /me devuelve el usuario dueño del token."""
    client.post(
        "/v1/auth/register",
        json={"email": "profile@x.com", "password": "MiPassword123!"},
    )
    login = client.post(
        "/v1/auth/login",
        json={"email": "profile@x.com", "password": "MiPassword123!"},
    )
    token = login.json()["access_token"]
    r = client.get(
        "/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert r.json()["email"] == "profile@x.com"
    print("  /me OK con JWT válido")


def test_me_sin_token_devuelve_401(client: TestClient):
    r = client.get("/v1/auth/me")
    assert r.status_code == 401
    print("  /me 401 sin token")


# ============================================================================
# TESTS - BÚSQUEDA DE VIAJES
# ============================================================================

def test_search_sin_viajes_devuelve_lista_vacia(client: TestClient, seed):
    seed()
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": 1,
            "id_terminal_destino": 2,
            "fecha_salida": (dt.date.today() + dt.timedelta(days=2)).isoformat(),
        },
    )
    assert r.status_code == 200
    assert r.json() == []
    print("  search sin viajes -> []")


def test_search_encuentra_viaje_y_cupos(client: TestClient, seed):
    """RF-03, RF-04, RF-05: devuelve el viaje con asientos libres."""
    data = seed()

    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body) == 1
    item = body[0]
    assert item["id_viaje"] == data["id_viaje"]
    assert item["terminal_origen"] == data["terminal_origen_nombre"]
    assert item["terminal_destino"] == data["terminal_destino_nombre"]
    assert item["asientos_libres"] == 5
    assert item["rampa_embarque"] == "Rampa 3"
    print(
        f"  search OK: viaje={item['id_viaje']} "
        f"libres={item['asientos_libres']}"
    )


def test_search_origen_destino_iguales_400(client: TestClient):
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": 1,
            "id_terminal_destino": 1,
            "fecha_salida": "2026-06-08",
        },
    )
    assert r.status_code == 400
    print("  search 400 con origen == destino")


def test_get_travel_by_id_devuelve_cupos(client: TestClient, seed):
    data = seed()
    r = client.get(f"/v1/travels/{data['id_viaje']}")
    assert r.status_code == 200
    assert r.json()["asientos_libres"] == 5
    print(f"  GET /travels/{data['id_viaje']} OK")


def test_get_travel_inexistente_devuelve_404(client: TestClient):
    r = client.get("/v1/travels/9999")
    assert r.status_code == 404
    print("  GET /travels/9999 -> 404")


# ============================================================================
# TESTS - FILTROS DINÁMICOS DE BÚSQUEDA
# ============================================================================

def test_search_filtro_precio_min_excluye(client: TestClient, seed):
    data = seed()
    # Las tarifas de la ruta son 75.00 (normal) y 110.00 (vip).
    # Con precio_min=200 ninguna tarifa califica -> la ruta queda
    # excluida y la búsqueda devuelve [].
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
            "precio_min": 200,
        },
    )
    assert r.status_code == 200
    assert r.json() == []
    print("  search precio_min=200 -> [] (ninguna tarifa >= 200)")


def test_search_filtro_precio_rango_incluye(client: TestClient, seed):
    data = seed()
    # Con precio_max=100 la ruta sólo califica por la tarifa 75 (normal).
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
            "precio_min": 50,
            "precio_max": 100,
        },
    )
    assert r.status_code == 200
    assert len(r.json()) == 1
    print("  search 50<=precio<=100 -> 1 resultado (tarifa 75 en rango)")


def test_search_filtro_agencias_lista_csv(client: TestClient, seed):
    data = seed()
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
            "agencias": f"{data['id_agencia']},9999",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["id_agencia"] == data["id_agencia"]
    print("  search agencias=1,9999 -> 1 resultado (filtra por .in_)")


def test_search_filtro_agencia_inexistente_devuelve_vacio(client: TestClient, seed):
    data = seed()
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
            "agencias": "9999",
        },
    )
    assert r.status_code == 200
    assert r.json() == []
    print("  search agencias=9999 -> []")


def test_search_filtro_tipo_servicio_normal_encuentra(client: TestClient, seed):
    """El bus de 1 piso tiene 5 asientos `normal` libres."""
    data = seed()
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
            "tipo_servicio": "normal",
        },
    )
    assert r.status_code == 200
    assert len(r.json()) == 1
    print("  search tipo_servicio=normal -> 1 resultado")


def test_search_filtro_tipo_servicio_vip_excluye_sin_vip(client: TestClient, seed):
    """El bus de 1 piso NO tiene asientos VIP -> no debe aparecer."""
    data = seed()
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
            "tipo_servicio": "vip",
        },
    )
    assert r.status_code == 200
    assert r.json() == []
    print("  search tipo_servicio=vip -> [] (bus 1 piso sin VIP)")


def test_search_filtro_turno_manana_encuentra(client: TestClient, seed):
    """El viaje semilla sale a las 08:00 -> turno 'manana'."""
    data = seed()
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
            "turno": "manana",
        },
    )
    assert r.status_code == 200
    assert len(r.json()) == 1
    print("  search turno=manana (08:00) -> 1 resultado")


def test_search_filtro_turno_tarde_excluye(client: TestClient, seed):
    """El viaje semilla sale a las 08:00 -> NO es turno tarde."""
    data = seed()
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
            "turno": "tarde",
        },
    )
    assert r.status_code == 200
    assert r.json() == []
    print("  search turno=tarde (08:00) -> []")


def test_search_filtro_turno_noche_excluye(client: TestClient, seed):
    data = seed()
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
            "turno": "noche",
        },
    )
    assert r.status_code == 200
    assert r.json() == []
    print("  search turno=noche (08:00) -> []")


def test_search_resuelve_ciudad_por_provincia(client: TestClient, seed, session_factory):
    """Creamos un segundo terminal en la misma provincia de Lima y
    verificamos que un viaje que parte de ese segundo terminal
    aparezca cuando buscamos por el primer terminal de la misma
    provincia.
    """
    data = seed()

    db = session_factory()
    try:
        extra_distrito = Distrito(id_distrito=2, id_provincia=1, nombre="Independencia")
        db.add(extra_distrito)
        db.flush()

        terminal_plaza_norte = Terminal(
            id_distrito=2,
            nombre="Terminal Plaza Norte",
            direccion="Av. Tomás Valle 1530",
        )
        db.add(terminal_plaza_norte)
        db.flush()

        ruta2 = Ruta(
            id_agencia=data["id_agencia"],
            id_terminal_origen=terminal_plaza_norte.id_terminal,
            id_terminal_destino=data["id_terminal_destino"],
            tarifa_base=Decimal("65.00"),
        )
        db.add(ruta2)
        db.flush()

        bus2 = Bus(
            id_agencia=data["id_agencia"],
            placa="XYZ-999",
            cantidad_pisos=1,
        )
        db.add(bus2)
        db.flush()

        for i, letra in enumerate(["A", "B", "C"]):
            a = Asiento(
                id_bus=bus2.id_bus,
                numero_asiento=f"{letra}1-1",
                fila=letra,
                piso=1,
                tipo_servicio="normal",
                coord_x=(i + 1) * 20,
                coord_y=30,
                bloqueado_manual=False,
            )
            db.add(a)
        db.flush()

        fecha_salida_date = dt.date.fromisoformat(data["fecha_salida"])
        salida_tarde = dt.datetime.combine(fecha_salida_date, dt.time(15, 0))
        viaje2 = Viaje(
            id_ruta=ruta2.id_ruta,
            id_bus=bus2.id_bus,
            fecha_hora_salida=salida_tarde,
            fecha_hora_llegada=salida_tarde + dt.timedelta(hours=8),
            estado="programado",
            rampa_embarque="Rampa 7",
        )
        db.add(viaje2)
        db.commit()
        viaje2_id = viaje2.id_viaje
    finally:
        db.close()

    # Buscamos por el terminal "Lima Centro" (misma provincia).
    # Deberíamos recibir AMBOS viajes: el de 08:00 (terminal 1) y el
    # de 15:00 (terminal Plaza Norte).
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body) == 2, f"Esperaba 2 viajes por ciudad-provincia, obtuve {len(body)}"
    ids = {item["id_viaje"] for item in body}
    assert data["id_viaje"] in ids
    assert viaje2_id in ids
    print(
        f"  search por ciudad -> {len(body)} viajes (incluye Plaza Norte + Javier Prado)"
    )


def test_search_parametros_invalidos_devuelve_422(client: TestClient):
    """Valores fuera de enum deben ser rechazados por FastAPI."""
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": 1,
            "id_terminal_destino": 2,
            "fecha_salida": "2026-06-08",
            "turno": "madrugada",  # no está en {manana, tarde, noche}
        },
    )
    assert r.status_code == 422
    print("  search turno=madrugada -> 422")


def test_search_rango_precio_invertido_devuelve_400(client: TestClient):
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": 1,
            "id_terminal_destino": 2,
            "fecha_salida": "2026-06-08",
            "precio_min": 200,
            "precio_max": 50,
        },
    )
    assert r.status_code == 400
    print("  search precio_min > precio_max -> 400")


# ============================================================================
# RUNNER
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
