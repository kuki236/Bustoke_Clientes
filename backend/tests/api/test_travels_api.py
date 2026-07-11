"""
Suite 2 — Búsqueda y consulta de viajes (RF-03, RF-04, RF-05).

Cubre los endpoints de solo-lectura del módulo `travels`:
  - GET /v1/travels/search          (con filtros: precio, agencia, tipo, turno)
  - GET /v1/travels/{id}             (detalle de un viaje)
  - GET /v1/travels/{id}/seats       (mapa de asientos en tiempo real)

Los datos sembrados por `seed_basico` (Lima → Trujillo, 08:00 AM)
sirven como fixture de oro para todos los tests de este archivo.
"""

import datetime as dt

from tests.api.helpers import (
    assert_is_iso_datetime,
    assert_json_keys,
    assert_non_empty_list,
    assert_status_code,
)


# ============================================================================
# GET /v1/travels/search
# ============================================================================

def test_search_sin_parametros_devuelve_422(client):
    """
    FastAPI debe rechazar la query con 422 si faltan los parámetros
    obligatorios (`id_terminal_origen`, `id_terminal_destino`,
    `fecha_salida`).
    """
    r = client.get("/v1/travels/search")
    assert_status_code(r, 422)


def test_search_encuentra_viaje_sembrado(client, seed_basico):
    """
    Caso feliz: con un viaje sembrado para mañana, la búsqueda
    con los IDs de terminal correctos debe devolver un array con
    un único elemento cuyas claves son las esperadas por la UI.
    """
    data = seed_basico()

    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
        },
    )
    assert_status_code(r, 200)
    resultados = assert_non_empty_list(r.json())
    assert len(resultados) == 1

    item = resultados[0]
    # Validamos la ESTRUCTURA completa del JSON de respuesta
    # (alineado con ViajeBusquedaResponse en schemas/travel_schema.py:136).
    assert_json_keys(item, [
        "id_viaje",
        "id_ruta",
        "id_bus",
        "id_agencia",
        "terminal_origen",
        "terminal_destino",
        "fecha_hora_salida",
        "fecha_hora_llegada",
        "estado",
        "rampa_embarque",
        "precio_base",
        "asientos_libres",
        "tipos_asiento",
    ])
    assert item["id_viaje"] == data["id_viaje"]
    assert item["asientos_libres"] == 5
    assert item["rampa_embarque"] == "Rampa 3"
    assert "normal" in item["tipos_asiento"]
    # Las fechas deben ser strings ISO 8601 válidos.
    assert_is_iso_datetime(item["fecha_hora_salida"])
    assert_is_iso_datetime(item["fecha_hora_llegada"])


def test_search_origen_destino_iguales_devuelve_400(client, seed_basico):
    """
    Validación de negocio: un viaje de A → A no tiene sentido, debe
    rechazarse con 400 (no 422, porque es una regla de dominio,
    no de schema).
    """
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": 1,
            "id_terminal_destino": 1,
            "fecha_salida": "2026-12-01",
        },
    )
    assert_status_code(r, 400)


def test_search_filtro_precio_rango_incluye(client, seed_basico):
    """
    Las tarifas sembradas son 75 (normal) y 110 (vip). Con
    `precio_max=100` solo debe aparecer la normal.
    """
    data = seed_basico()
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
    assert_status_code(r, 200)
    resultados = r.json()
    assert len(resultados) == 1


def test_search_filtro_precio_min_excluye(client, seed_basico):
    """
    Con `precio_min=200` (mayor que la tarifa más alta) no debe
    haber resultados.
    """
    data = seed_basico()
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
            "precio_min": 200,
        },
    )
    assert_status_code(r, 200)
    assert r.json() == []


def test_search_filtro_turno_invalido_devuelve_422(client, seed_basico):
    """
    El parámetro `turno` es un Literal['manana','tarde','noche'].
    Valores fuera del enum deben rechazarse con 422.
    """
    data = seed_basico()
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
            "turno": "madrugada",  # NO está en el enum
        },
    )
    assert_status_code(r, 422)


def test_search_filtro_turno_manana_encuentra(client, seed_basico):
    """
    El viaje sembrado sale a las 08:00 → turno 'manana'.
    """
    data = seed_basico()
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
            "turno": "manana",
        },
    )
    assert_status_code(r, 200)
    assert len(r.json()) == 1


def test_search_sin_viajes_devuelve_lista_vacia(client, seed_basico):
    """
    Si la fecha consultada no tiene viajes (mañana+2), la respuesta
    debe ser un array vacío (no null, no 404).
    """
    seed_basico()
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": 1,
            "id_terminal_destino": 2,
            "fecha_salida": (dt.date.today() + dt.timedelta(days=2)).isoformat(),
        },
    )
    assert_status_code(r, 200)
    assert r.json() == []


# ============================================================================
# GET /v1/travels/{id_viaje}
# ============================================================================

def test_get_viaje_por_id_devuelve_detalle(client, seed_basico):
    """
    El endpoint de detalle debe devolver el viaje con sus
    contadores en tiempo real (asientos_libres = total).
    """
    data = seed_basico()
    r = client.get(f"/v1/travels/{data['id_viaje']}")
    assert_status_code(r, 200)
    body = r.json()
    assert_json_keys(body, [
        "id_viaje", "id_ruta", "id_bus", "fecha_hora_salida",
        "fecha_hora_llegada", "estado", "rampa_embarque", "asientos_libres",
    ])
    assert body["id_viaje"] == data["id_viaje"]
    assert body["asientos_libres"] == data["total_asientos"]


def test_get_viaje_inexistente_devuelve_404(client):
    """
    Un ID de viaje que no existe debe responder 404 (no 500).
    """
    r = client.get("/v1/travels/9999")
    assert_status_code(r, 404)


# ============================================================================
# GET /v1/travels/{id_viaje}/seats
# ============================================================================

def test_get_mapa_asientos_devuelve_estructura_correcta(client, seed_basico):
    """
    El mapa de asientos debe devolver todos los asientos físicos
    del bus asociado al viaje, con su `estado_interfaz` resuelto
    en tiempo real desde la vista `vw_estado_asientos_viaje`.
    """
    data = seed_basico()
    r = client.get(f"/v1/travels/{data['id_viaje']}/seats")
    assert_status_code(r, 200)

    body = r.json()
    assert_json_keys(body, ["id_viaje", "id_bus", "cantidad_pisos", "asientos"])
    assert body["id_viaje"] == data["id_viaje"]
    assert body["id_bus"] == data["id_bus"]
    assert body["cantidad_pisos"] == 1

    asientos = assert_non_empty_list(body["asientos"], min_length=data["total_asientos"])
    # Todos los asientos del bus semilla deben estar libres.
    assert all(a["estado_interfaz"] == "libre" for a in asientos)

    # Validamos la forma del primer asiento (alineado con AsientoMapaItem).
    sample = asientos[0]
    assert_json_keys(sample, [
        "id_asiento", "numero_asiento", "fila", "piso", "tipo_servicio",
        "coord_x", "coord_y", "bloqueado_manual", "estado_interfaz", "precio",
    ])
    # El número de asiento debe respetar el patrón 'A1-1' (regex CHECK).
    import re
    assert re.match(r"^[A-Z][0-9]-[0-9]+$", sample["numero_asiento"]), (
        f"Formato de numero_asiento inválido: {sample['numero_asiento']}"
    )


def test_get_mapa_asientos_viaje_inexistente_devuelve_404(client):
    """
    Un viaje inexistente debe rechazarse con 404, no devolver un
    mapa vacío (que confundiría a la UI).
    """
    r = client.get("/v1/travels/9999/seats")
    assert_status_code(r, 404)


# ============================================================================
# Migrados de la suite legacy `tests/test_auth_and_travels.py` (32 tests).
# Casos únicos no cubiertos por la suite original de `test_travels_api.py`.
# Migrados el 2026-07-11 durante la consolidación de suites.
# ============================================================================

def test_search_filtro_agencias_lista_csv(client, seed_basico):
    """
    El parámetro `agencias` acepta una lista CSV (ej: "1,9999") y
    filtra con un `IN` sobre `id_agencia`. Una agencia inexistente
    mezclada con una válida debe devolver solo los viajes de la
    agencia válida.
    """
    data = seed_basico()
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
            "agencias": f"{data['id_agencia']},9999",
        },
    )
    assert_status_code(r, 200)
    body = r.json()
    assert len(body) == 1
    assert body[0]["id_agencia"] == data["id_agencia"]


def test_search_filtro_agencia_inexistente_devuelve_vacio(client, seed_basico):
    """
    Si se filtra por una agencia que no existe, la búsqueda
    devuelve una lista vacía (no 404 — la agencia es un filtro
    opcional).
    """
    data = seed_basico()
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
            "agencias": "9999",
        },
    )
    assert_status_code(r, 200)
    assert r.json() == []


def test_search_filtro_tipo_servicio_normal_encuentra(client, seed_basico):
    """
    El bus de 1 piso tiene 5 asientos `normal` libres. Filtrar por
    `tipo_servicio=normal` debe devolver 1 resultado.
    """
    data = seed_basico()
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
            "tipo_servicio": "normal",
        },
    )
    assert_status_code(r, 200)
    assert len(r.json()) == 1


def test_search_filtro_tipo_servicio_vip_excluye_sin_vip(client, seed_basico):
    """
    El bus semilla de 1 piso NO tiene asientos VIP. Filtrar por
    `tipo_servicio=vip` debe devolver lista vacía.
    """
    data = seed_basico()
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
            "tipo_servicio": "vip",
        },
    )
    assert_status_code(r, 200)
    assert r.json() == []


def test_search_filtro_turno_tarde_excluye(client, seed_basico):
    """
    El viaje semilla sale a las 08:00 → NO es turno 'tarde'
    (rango 12:00–17:59). El filtro por turno debe devolver [].
    """
    data = seed_basico()
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
            "turno": "tarde",
        },
    )
    assert_status_code(r, 200)
    assert r.json() == []


def test_search_filtro_turno_noche_excluye(client, seed_basico):
    """
    El viaje semilla sale a las 08:00 → NO es turno 'noche'
    (rango 18:00–23:59). El filtro por turno debe devolver [].
    """
    data = seed_basico()
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
            "turno": "noche",
        },
    )
    assert_status_code(r, 200)
    assert r.json() == []


def test_search_resuelve_ciudad_por_provincia(client, seed_basico, db_session):
    """
    Si dos terminales pertenecen a la misma provincia (ej: dos
    terminales en Lima), una búsqueda por uno debe devolver
    también los viajes del otro terminal de esa provincia. Esto
    permite al usuario buscar por "ciudad" sin saber el terminal
    exacto.
    """
    from decimal import Decimal

    from app.models import Asiento, Bus, Distrito, Ruta, Terminal, Viaje

    data = seed_basico()

    # Segundo distrito en la misma provincia de Lima.
    db_session.add(Distrito(id_distrito=2, id_provincia=1, nombre="Independencia"))
    db_session.flush()

    terminal_plaza_norte = Terminal(
        id_distrito=2,
        nombre="Terminal Plaza Norte",
        direccion="Av. Tomás Valle 1530",
    )
    db_session.add(terminal_plaza_norte)
    db_session.flush()

    ruta2 = Ruta(
        id_agencia=data["id_agencia"],
        id_terminal_origen=terminal_plaza_norte.id_terminal,
        id_terminal_destino=data["id_terminal_destino"],
        tarifa_base=Decimal("65.00"),
    )
    db_session.add(ruta2)
    db_session.flush()

    bus2 = Bus(
        id_agencia=data["id_agencia"],
        placa="XYZ-999",
        cantidad_pisos=1,
    )
    db_session.add(bus2)
    db_session.flush()

    for i, letra in enumerate(["A", "B", "C"]):
        db_session.add(Asiento(
            id_bus=bus2.id_bus,
            numero_asiento=f"{letra}1-1",
            fila=letra,
            piso=1,
            tipo_servicio="normal",
            coord_x=(i + 1) * 20,
            coord_y=30,
            bloqueado_manual=False,
        ))
    db_session.flush()

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
    db_session.add(viaje2)
    db_session.commit()
    viaje2_id = viaje2.id_viaje

    # Buscamos por el terminal "Lima Centro" (misma provincia).
    # Esperamos recibir AMBOS viajes: el de 08:00 (terminal 1) y
    # el de 15:00 (terminal Plaza Norte).
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": data["id_terminal_origen"],
            "id_terminal_destino": data["id_terminal_destino"],
            "fecha_salida": data["fecha_salida"],
        },
    )
    assert_status_code(r, 200)
    body = r.json()
    assert len(body) == 2, (
        f"Esperaba 2 viajes por ciudad-provincia, obtuve {len(body)}"
    )
    ids = {item["id_viaje"] for item in body}
    assert data["id_viaje"] in ids
    assert viaje2_id in ids


def test_search_parametros_invalidos_devuelve_422(client):
    """
    Valores fuera del enum deben ser rechazados por FastAPI/Pydantic
    con 422 antes de llegar al repositorio.
    """
    r = client.get(
        "/v1/travels/search",
        params={
            "id_terminal_origen": 1,
            "id_terminal_destino": 2,
            "fecha_salida": "2026-06-08",
            "turno": "madrugada",
        },
    )
    assert_status_code(r, 422)


def test_search_rango_precio_invertido_devuelve_400(client):
    """
    Si `precio_min > precio_max`, el endpoint debe rechazar la
    petición con 400 (validación de coherencia, no 422).
    """
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
    assert_status_code(r, 400)
