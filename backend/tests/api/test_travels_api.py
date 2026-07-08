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
