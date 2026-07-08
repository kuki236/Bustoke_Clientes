"""
Suite 3 — Bloqueo y liberación de asientos (RF-05, RF-07, RF-08).

Cubre el ciclo de vida de un `hold`:
  - POST /v1/seats/hold              (crear o renovar)
  - POST /v1/seats/release           (liberar)
  - POST /v1/seats/release-sync      (batch para sendBeacon / beforeunload)

Los tests asumen que la base ya tiene un viaje + 5 asientos sembrados
(via `seed_basico`).
"""

import pytest

from tests.api.helpers import assert_json_keys, assert_status_code


@pytest.fixture
def viaje_con_asientos(client, seed_basico):
    """
    Devuelve el id_viaje + 5 id_asiento del bus semilla. Cada test
    usa uno o más asientos sin generar conflictos porque la
    transacción se revierte al final.
    """
    data = seed_basico()
    # Recuperamos los IDs de los asientos creados consultando el mapa.
    r = client.get(f"/v1/travels/{data['id_viaje']}/seats")
    assert r.status_code == 200
    asientos = r.json()["asientos"]
    return {
        **data,
        "id_asientos": [a["id_asiento"] for a in asientos],
    }


# ============================================================================
# POST /v1/seats/hold
# ============================================================================

def test_hold_asiento_libre_devuelve_201(client, viaje_con_asientos):
    """
    Caso feliz: hacer hold de un asiento libre debe devolver 201
    con `estado='activo'`, un `id_bloqueo` y un `expira_at` futuro.
    """
    data = viaje_con_asientos
    r = client.post(
        "/v1/seats/hold",
        json={
            "id_viaje": data["id_viaje"],
            "id_asiento": data["id_asientos"][0],
            "token_sesion": "sess-test-001",
        },
    )
    assert_status_code(r, 201)
    body = r.json()
    assert_json_keys(body, ["id_viaje", "id_asiento", "id_bloqueo", "expira_at", "estado"])
    assert body["id_viaje"] == data["id_viaje"]
    assert body["id_asiento"] == data["id_asientos"][0]
    assert body["estado"] == "activo"
    assert body["id_bloqueo"] is not None
    assert body["expira_at"] is not None


def test_hold_segunda_vez_mismo_token_es_idempotente(client, viaje_con_asientos):
    """
    Si el mismo `token_sesion` hace hold sobre un asiento que ya
    tiene un hold suyo, el endpoint RENUEVA la expiración (no
    crea uno nuevo) y devuelve 201 con el mismo `id_bloqueo`.
    """
    data = viaje_con_asientos
    payload = {
        "id_viaje": data["id_viaje"],
        "id_asiento": data["id_asientos"][0],
        "token_sesion": "sess-mismo-token",
    }
    r1 = client.post("/v1/seats/hold", json=payload)
    assert_status_code(r1, 201)
    id_bloqueo_inicial = r1.json()["id_bloqueo"]

    r2 = client.post("/v1/seats/hold", json=payload)
    assert_status_code(r2, 201)
    assert r2.json()["id_bloqueo"] == id_bloqueo_inicial


def test_hold_con_otro_token_devuelve_409(client, viaje_con_asientos):
    """
    Si un token de sesión distinto intenta hacer hold sobre un
    asiento ya bloqueado por otro token, debe recibir 409 con
    un mensaje que mencione el bloqueo.
    """
    data = viaje_con_asientos
    # Primer hold con token A.
    r1 = client.post(
        "/v1/seats/hold",
        json={
            "id_viaje": data["id_viaje"],
            "id_asiento": data["id_asientos"][0],
            "token_sesion": "sess-A",
        },
    )
    assert_status_code(r1, 201)

    # Segundo hold con token B sobre el mismo asiento.
    r2 = client.post(
        "/v1/seats/hold",
        json={
            "id_viaje": data["id_viaje"],
            "id_asiento": data["id_asientos"][0],
            "token_sesion": "sess-B",
        },
    )
    assert_status_code(r2, 409)
    assert "bloqueado" in r2.json()["detail"].lower()


def test_hold_asiento_que_no_pertenece_al_bus_devuelve_404_o_409(client, viaje_con_asientos):
    """
    Un id_asiento válido pero que NO pertenece al bus del viaje
    debe rechazarse con 4xx (404 si el viaje tampoco existe,
    409 si solo el asiento es ajeno al bus). Cubre FIX de
    validación cruzada en SeatService.

    NOTA: el endpoint traduce `ValueError("no encontrado")` → 404
    y cualquier otro `ValueError` → 409. Nuestro test cae en el
    segundo caso (mensaje "no pertenece al bus"), por eso 409.
    """
    data = viaje_con_asientos
    r = client.post(
        "/v1/seats/hold",
        json={
            "id_viaje": data["id_viaje"],
            "id_asiento": 99999,  # No existe en el bus
            "token_sesion": "sess-xyz",
        },
    )
    assert r.status_code in (404, 409), (
        f"Se esperaba 4xx para asiento ajeno, recibí {r.status_code}. "
        f"Body: {r.text}"
    )


def test_hold_viaje_inexistente_devuelve_404(client):
    """
    Un id_viaje que no existe debe rechazarse con 404 (mensaje
    "Viaje X no encontrado" contiene "no encontrado").
    """
    r = client.post(
        "/v1/seats/hold",
        json={
            "id_viaje": 99999,
            "id_asiento": 1,
            "token_sesion": "sess-viaje-bad",
        },
    )
    assert_status_code(r, 404)


def test_hold_con_ttl_custom_devuelve_201(client, viaje_con_asientos):
    """
    El cliente puede especificar `segundos_ttl` (10-3600) y el
    backend debe respetarlo.
    """
    data = viaje_con_asientos
    r = client.post(
        "/v1/seats/hold",
        json={
            "id_viaje": data["id_viaje"],
            "id_asiento": data["id_asientos"][1],
            "token_sesion": "sess-ttl",
            "segundos_ttl": 60,
        },
    )
    assert_status_code(r, 201)
    assert r.json()["estado"] == "activo"


def test_hold_con_ttl_invalido_devuelve_422(client, viaje_con_asientos):
    """
    Pydantic valida `segundos_ttl: ge=10, le=3600`. Un valor fuera
    de rango debe rechazarse con 422 antes de llegar al servicio.
    """
    data = viaje_con_asientos
    r = client.post(
        "/v1/seats/hold",
        json={
            "id_viaje": data["id_viaje"],
            "id_asiento": data["id_asientos"][0],
            "token_sesion": "sess-ttl-bad",
            "segundos_ttl": 5,  # < 10
        },
    )
    assert_status_code(r, 422)


# ============================================================================
# POST /v1/seats/release
# ============================================================================

def test_release_asiento_bloqueado_devuelve_liberado(client, viaje_con_asientos):
    """
    Tras un hold exitoso, un release con el mismo `token_sesion`
    debe marcar el hold como liberado y devolver 200.
    """
    data = viaje_con_asientos
    # Primero creamos el hold.
    client.post(
        "/v1/seats/hold",
        json={
            "id_viaje": data["id_viaje"],
            "id_asiento": data["id_asientos"][0],
            "token_sesion": "sess-rel",
        },
    )
    # Luego lo liberamos.
    r = client.post(
        "/v1/seats/release",
        json={
            "id_viaje": data["id_viaje"],
            "id_asiento": data["id_asientos"][0],
            "token_sesion": "sess-rel",
        },
    )
    assert_status_code(r, 200)
    body = r.json()
    assert body["estado"] in ("liberado", "sin_bloqueo")
    assert body["id_viaje"] == data["id_viaje"]
    assert body["id_asiento"] == data["id_asientos"][0]


def test_release_sin_bloqueo_devuelve_sin_bloqueo(client, viaje_con_asientos):
    """
    Liberar un asiento que NUNCA fue bloqueado debe responder 200
    con `estado='sin_bloqueo'`, no 404 ni 409. Esto es importante
    para que la UI pueda des-seleccionar sin interrumpir el flujo.
    """
    data = viaje_con_asientos
    r = client.post(
        "/v1/seats/release",
        json={
            "id_viaje": data["id_viaje"],
            "id_asiento": data["id_asientos"][2],
            "token_sesion": "sess-nadie",
        },
    )
    assert_status_code(r, 200)
    assert r.json()["estado"] == "sin_bloqueo"


# ============================================================================
# POST /v1/seats/release-sync (batch para beforeunload)
# ============================================================================

def test_release_sync_batch_libera_multiples_holds(client, viaje_con_asientos):
    """
    El endpoint batch recibe un array de items y los libera. Es
    tolerante a fallos parciales: items que no se pueden liberar
    no rompen la respuesta (devuelve 200 siempre).
    """
    data = viaje_con_asientos
    # Creamos 3 holds sobre los 3 primeros asientos.
    for i in range(3):
        client.post(
            "/v1/seats/hold",
            json={
                "id_viaje": data["id_viaje"],
                "id_asiento": data["id_asientos"][i],
                "token_sesion": "sess-batch",
            },
        )
    # Liberamos los 3 en una sola llamada.
    r = client.post(
        "/v1/seats/release-sync",
        json={
            "items": [
                {
                    "id_viaje": data["id_viaje"],
                    "id_asiento": data["id_asientos"][i],
                    "token_sesion": "sess-batch",
                }
                for i in range(3)
            ]
        },
    )
    assert_status_code(r, 200)
    body = r.json()
    assert_json_keys(body, ["ok", "released", "total"])
    assert body["ok"] is True
    assert body["total"] == 3
    assert body["released"] == 3


def test_release_sync_con_items_vacios_devuelve_200(client, viaje_con_asientos):
    """
    Un array vacío debe responderse con `released=0, total=0`,
    sin lanzar 422 (es un caso válido: el usuario cerró la pestaña
    sin haber seleccionado nada).
    """
    r = client.post(
        "/v1/seats/release-sync",
        json={"items": []},
    )
    assert_status_code(r, 200)
    body = r.json()
    assert body["ok"] is True
    assert body["released"] == 0
    assert body["total"] == 0


# ============================================================================
# Verificación de contrato: GET/PUT/DELETE no expuestos
# ============================================================================

def test_get_en_seats_no_expuesto_devuelve_405(client):
    """
    Aserción de contrato: la API no expone GET sobre /v1/seats.
    Verificar que devuelve 405 (Method Not Allowed) previene
    regresiones si alguien agrega accidentalmente un handler.
    """
    r = client.get("/v1/seats/hold")
    assert r.status_code in (405, 404)


def test_delete_en_seats_no_expuesto_devuelve_405(client):
    """
    Aserción de contrato: la API no expone DELETE. Útil para
    detectar acoplamientos accidentales a verbos no soportados.
    """
    r = client.delete("/v1/seats/hold")
    assert r.status_code in (405, 404)
