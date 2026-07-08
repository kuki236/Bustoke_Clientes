"""
Suite 4 — Reclamos: ciclo de vida completo estilo CRUD.

Cubre el ÚNICO recurso del backend con verbos variados:
  - POST   /v1/claims/                      (Create)
  - GET    /v1/claims/me                    (List)
  - GET    /v1/claims/{id}                  (Read con hilo de mensajes)
  - POST   /v1/claims/{id}/messages         (Update: añadir mensaje)
  - POST   /v1/claims/{id}/respond          (Update: cierre admin)
  - DELETE /v1/claims/{id}                  (NO IMPLEMENTADO → 405)

La API de Bustoke no expone PUT ni DELETE en ningún endpoint.
`respond` actúa como "update" del estado, y verificamos que DELETE
responda 405 explícitamente (aserción de contrato).
"""

import pytest

from tests.api.helpers import assert_json_keys, assert_status_code


@pytest.fixture
def usuario_agencia(db_session, seed_basico):
    """
    Crea DOS usuarios:
      - 'cliente' (pasajero normal, ya viene con la siembra).
      - 'admin_agencia' vinculado a la agencia sembrada (para
        poder responder reclamos — FIX BUG-138).
    """
    from app.core.security import hash_password
    from app.models import Usuario

    data = seed_basico()
    admin = Usuario(
        email="admin@bustoke-test.com",
        password_hash=hash_password("AdminPass123!"),
        telefono="999888777",
        rol="admin_agencia",
        id_agencia=data["id_agencia"],
        activo=True,
    )
    db_session.add(admin)
    db_session.flush()
    return {
        **data,
        "id_admin": admin.id_usuario,
    }


def _payload_crear_reclamo(id_agencia: int) -> dict:
    return {
        "id_agencia": id_agencia,
        "motivo": "Retraso en la salida del bus",
        "detalle": "El bus debía salir a las 08:00 y salió a las 09:30 "
                   "sin aviso previo. Pido explicación y reembolso parcial.",
    }


# ============================================================================
# POST /v1/claims/ — CREATE
# ============================================================================

def test_crear_reclamo_devuelve_201(client, auth_headers, usuario_agencia):
    """
    Caso feliz: un pasajero autenticado puede crear un reclamo
    contra una agencia. El estado inicial debe ser 'abierto'.
    """
    headers, _ = auth_headers
    r = client.post(
        "/v1/claims/",
        json=_payload_crear_reclamo(usuario_agencia["id_agencia"]),
        headers=headers,
    )
    assert_status_code(r, 201)
    body = r.json()
    assert_json_keys(body, [
        "id_reclamo", "id_usuario", "id_agencia",
        "motivo", "detalle", "estado", "fecha_creacion",
    ])
    assert body["estado"] == "abierto"
    assert body["motivo"].startswith("Retraso")


def test_crear_reclamo_sin_auth_devuelve_401(client, usuario_agencia):
    """
    La creación de reclamos es un endpoint protegido: sin JWT
    debe rechazarse con 401.
    """
    r = client.post(
        "/v1/claims/",
        json=_payload_crear_reclamo(usuario_agencia["id_agencia"]),
    )
    assert_status_code(r, 401)


def test_crear_reclamo_detalle_muy_corto_devuelve_422(client, auth_headers, usuario_agencia):
    """
    Pydantic valida `detalle: min_length=1`. Un detalle vacío
    debe rechazarse con 422.
    """
    headers, _ = auth_headers
    payload = _payload_crear_reclamo(usuario_agencia["id_agencia"])
    payload["detalle"] = ""
    r = client.post("/v1/claims/", json=payload, headers=headers)
    assert_status_code(r, 422)


def test_crear_reclamo_detalle_14_chars_devuelve_422(
    client, auth_headers, usuario_agencia
):
    """
    El schema `ReclamoCreate.detalle` exige `min_length=15` para
    alinear el backend con la regla de negocio que el frontend ya
    enforza (`claims.js:30-32` — "El detalle debe tener al menos
    15 caracteres"). Un detalle de EXACTAMENTE 14 caracteres debe
    rechazarse con 422 (validación Pydantic, status 422). Esta
    cobertura protege la frontera inferior inclusiva: 14 → 422,
    15 → 201.
    """
    headers, _ = auth_headers
    payload = _payload_crear_reclamo(usuario_agencia["id_agencia"])
    payload["detalle"] = "a" * 14
    r = client.post("/v1/claims/", json=payload, headers=headers)
    assert_status_code(r, 422)
    # El mensaje debe apuntar a `detalle` y mencionar el mínimo.
    detail = r.json().get("detail", "")
    assert "detalle" in detail.lower()
    assert "15" in detail


def test_crear_reclamo_detalle_15_chars_exactos_es_valido(
    client, auth_headers, usuario_agencia
):
    """
    Complemento de `test_crear_reclamo_detalle_14_chars_devuelve_422`:
    verifica la frontera SUPERIOR inclusiva. Un detalle de 15
    caracteres debe aceptarse (201) porque `min_length=15` es
    inclusivo en el límite.
    """
    headers, _ = auth_headers
    payload = _payload_crear_reclamo(usuario_agencia["id_agencia"])
    payload["detalle"] = "a" * 15
    r = client.post("/v1/claims/", json=payload, headers=headers)
    assert_status_code(r, 201)
    assert len(r.json()["detalle"]) == 15


# ============================================================================
# GET /v1/claims/me — LIST
# ============================================================================

def test_listar_mis_reclamos_devuelve_array_con_el_creado(
    client, auth_headers, usuario_agencia
):
    """
    Tras crear un reclamo, el endpoint `me` debe listarlo.
    """
    headers, _ = auth_headers
    # Creamos un reclamo.
    client.post(
        "/v1/claims/",
        json=_payload_crear_reclamo(usuario_agencia["id_agencia"]),
        headers=headers,
    )
    # Listamos.
    r = client.get("/v1/claims/me", headers=headers)
    assert_status_code(r, 200)
    resultados = r.json()
    assert isinstance(resultados, list)
    assert len(resultados) >= 1
    # El reclamo recién creado debe estar en la lista.
    assert any(rec["estado"] == "abierto" for rec in resultados)


def test_listar_mis_reclamos_sin_auth_devuelve_401(client):
    """
    El listado también es protegido: sin JWT, 401.
    """
    r = client.get("/v1/claims/me")
    assert_status_code(r, 401)


# ============================================================================
# GET /v1/claims/{id} — READ con hilo
# ============================================================================

def test_detalle_reclamo_incluye_hilo_vacio_inicialmente(
    client, auth_headers, usuario_agencia
):
    """
    Al crear un reclamo, su hilo de mensajes está vacío (`mensajes: []`).
    """
    headers, _ = auth_headers
    r_crear = client.post(
        "/v1/claims/",
        json=_payload_crear_reclamo(usuario_agencia["id_agencia"]),
        headers=headers,
    )
    id_reclamo = r_crear.json()["id_reclamo"]

    r = client.get(f"/v1/claims/{id_reclamo}", headers=headers)
    assert_status_code(r, 200)
    body = r.json()
    assert_json_keys(body, [
        "id_reclamo", "id_usuario", "id_agencia", "motivo",
        "detalle", "estado", "fecha_creacion", "mensajes",
    ])
    assert body["mensajes"] == []


def test_detalle_reclamo_ajeno_devuelve_403(client, auth_headers, usuario_agencia):
    """
    Un pasajero NO puede leer el reclamo de otro. Esto valida
    la autorización por ownership (FIX privacidad).
    """
    headers_cliente_a, _ = auth_headers
    # Cliente A crea un reclamo.
    r_crear = client.post(
        "/v1/claims/",
        json=_payload_crear_reclamo(usuario_agencia["id_agencia"]),
        headers=headers_cliente_a,
    )
    id_reclamo = r_crear.json()["id_reclamo"]

    # Registramos un Cliente B.
    from datetime import datetime
    suffix = datetime.now().strftime("%H%M%S%f")
    r_reg_b = client.post(
        "/v1/auth/register",
        json={
            "nombres": "Cliente",
            "apellido_paterno": "B",
            "apellido_materno": "Test",
            "tipo_documento": "DNI",
            "numero_documento": f"7{suffix[-7:].zfill(7)}",
            "telefono": "987000111",
            "email": f"cliente.b.{suffix}@bustoke-test.com",
            "contrasena": "PassB12345!",
        },
    )
    token_b = r_reg_b.json()["access_token"]

    # Cliente B intenta leer el reclamo de A.
    r = client.get(
        f"/v1/claims/{id_reclamo}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert_status_code(r, 403)


def test_detalle_reclamo_inexistente_devuelve_404(client, auth_headers):
    """
    Un ID de reclamo que no existe debe rechazarse con 404.
    """
    headers, _ = auth_headers
    r = client.get("/v1/claims/99999", headers=headers)
    assert_status_code(r, 404)


# ============================================================================
# POST /v1/claims/{id}/messages — UPDATE: agregar mensaje
# ============================================================================

def test_agregar_mensaje_aumenta_hilo(client, auth_headers, usuario_agencia):
    """
    El pasajero puede añadir mensajes al hilo de su propio reclamo.
    Tras añadir uno, el detalle debe reflejar el mensaje nuevo.
    """
    headers, _ = auth_headers
    r_crear = client.post(
        "/v1/claims/",
        json=_payload_crear_reclamo(usuario_agencia["id_agencia"]),
        headers=headers,
    )
    id_reclamo = r_crear.json()["id_reclamo"]

    r_msg = client.post(
        f"/v1/claims/{id_reclamo}/messages",
        json={"text_mensaje": "Adjunto foto del ticket de embarque."},
        headers=headers,
    )
    assert_status_code(r_msg, 201)
    body_msg = r_msg.json()
    assert_json_keys(body_msg, ["id_mensaje", "id_reclamo", "id_usuario", "text_mensaje", "fecha"])
    assert body_msg["id_reclamo"] == id_reclamo

    # El detalle del reclamo ahora debe tener 1 mensaje en el hilo.
    r_det = client.get(f"/v1/claims/{id_reclamo}", headers=headers)
    assert_status_code(r_det, 200)
    assert len(r_det.json()["mensajes"]) == 1


def test_agregar_mensaje_a_reclamo_ajeno_devuelve_403(client, auth_headers, usuario_agencia):
    """
    No se puede añadir mensajes al hilo de un reclamo ajeno.
    """
    headers_cliente_a, _ = auth_headers
    r_crear = client.post(
        "/v1/claims/",
        json=_payload_crear_reclamo(usuario_agencia["id_agencia"]),
        headers=headers_cliente_a,
    )
    id_reclamo = r_crear.json()["id_reclamo"]

    # Registramos un Cliente B.
    from datetime import datetime
    suffix = datetime.now().strftime("%H%M%S%f")
    r_reg_b = client.post(
        "/v1/auth/register",
        json={
            "nombres": "Cliente",
            "apellido_paterno": "B",
            "apellido_materno": "Spy",
            "tipo_documento": "DNI",
            "numero_documento": f"7{suffix[-7:].zfill(7)}",
            "telefono": "987000222",
            "email": f"spy.{suffix}@bustoke-test.com",
            "contrasena": "PassB12345!",
        },
    )
    token_b = r_reg_b.json()["access_token"]

    r = client.post(
        f"/v1/claims/{id_reclamo}/messages",
        json={"text_mensaje": "Intento de intrusión."},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert_status_code(r, 403)


# ============================================================================
# POST /v1/claims/{id}/respond — UPDATE por admin (cierre)
# ============================================================================

def test_responder_reclamo_cambia_estado_y_agrega_mensaje(
    client, auth_headers, usuario_agencia
):
    """
    FIX BUG-138: solo `admin_agencia` (de la misma agencia) o
    `superadmin` puede responder. Al responder:
      - el estado del reclamo cambia a 'resuelto'
      - el hilo añade la respuesta como mensaje.
    """
    headers_cliente, _ = auth_headers

    # 1) Cliente crea el reclamo.
    r_crear = client.post(
        "/v1/claims/",
        json=_payload_crear_reclamo(usuario_agencia["id_agencia"]),
        headers=headers_cliente,
    )
    id_reclamo = r_crear.json()["id_reclamo"]

    # 2) Admin de la agencia inicia sesión y responde.
    r_login_admin = client.post(
        "/v1/auth/login",
        json={"email": "admin@bustoke-test.com", "password": "AdminPass123!"},
    )
    assert_status_code(r_login_admin, 200)
    token_admin = r_login_admin.json()["access_token"]
    headers_admin = {"Authorization": f"Bearer {token_admin}"}

    r_respond = client.post(
        f"/v1/claims/{id_reclamo}/respond",
        json={
            "estado": "resuelto",
            "respuesta": "Lamentamos el retraso. Se aplicó reembolso del 50%.",
        },
        headers=headers_admin,
    )
    assert_status_code(r_respond, 200)
    body = r_respond.json()
    assert body["estado"] == "resuelto"
    # El hilo ahora debe contener la respuesta del admin.
    assert len(body["mensajes"]) >= 1
    assert any(
        "reembolso" in m["text_mensaje"].lower()
        for m in body["mensajes"]
    )


def test_responder_reclamo_como_pasajero_devuelve_403(
    client, auth_headers, usuario_agencia
):
    """
    Un pasajero NO puede responder (ni cerrar) su propio reclamo.
    Esto valida la separación de roles del FIX BUG-138.
    """
    headers, _ = auth_headers
    r_crear = client.post(
        "/v1/claims/",
        json=_payload_crear_reclamo(usuario_agencia["id_agencia"]),
        headers=headers,
    )
    id_reclamo = r_crear.json()["id_reclamo"]

    r = client.post(
        f"/v1/claims/{id_reclamo}/respond",
        json={"estado": "resuelto", "respuesta": "Me respondo a mí mismo."},
        headers=headers,
    )
    assert_status_code(r, 403)


def test_responder_reclamo_con_respuesta_vacia_devuelve_422(
    client, auth_headers, usuario_agencia
):
    """
    El campo `respuesta` del payload del admin está restringido a
    `min_length=1`. Una respuesta vacía debe rechazarse con 422
    (validación Pydantic de schema, no de field_validator).
    """
    headers_cliente, _ = auth_headers
    r_crear = client.post(
        "/v1/claims/",
        json=_payload_crear_reclamo(usuario_agencia["id_agencia"]),
        headers=headers_cliente,
    )
    id_reclamo = r_crear.json()["id_reclamo"]

    r_login_admin = client.post(
        "/v1/auth/login",
        json={"email": "admin@bustoke-test.com", "password": "AdminPass123!"},
    )
    headers_admin = {"Authorization": f"Bearer {r_login_admin.json()['access_token']}"}

    r = client.post(
        f"/v1/claims/{id_reclamo}/respond",
        json={"estado": "resuelto", "respuesta": ""},  # vacía → 422
        headers=headers_admin,
    )
    assert_status_code(r, 422)


def test_responder_reclamo_con_estado_invalido_devuelve_422(
    client, auth_headers, usuario_agencia
):
    """
    El campo `estado` del payload del admin está restringido a
    {'en_proceso', 'resuelto'} por un `field_validator` custom.

    FIX A02: tras añadir `jsonable_encoder(exc.errors())` al
    `validation_exception_handler` de `main.py`, el handler ya
    serializa correctamente incluso cuando el `ctx` del error
    contiene objetos `ValueError`. Por tanto, el rechazo se
    traduce en un HTTP 422 limpio.
    """
    headers_cliente, _ = auth_headers
    r_crear = client.post(
        "/v1/claims/",
        json=_payload_crear_reclamo(usuario_agencia["id_agencia"]),
        headers=headers_cliente,
    )
    id_reclamo = r_crear.json()["id_reclamo"]

    r_login_admin = client.post(
        "/v1/auth/login",
        json={"email": "admin@bustoke-test.com", "password": "AdminPass123!"},
    )
    headers_admin = {"Authorization": f"Bearer {r_login_admin.json()['access_token']}"}

    r = client.post(
        f"/v1/claims/{id_reclamo}/respond",
        json={"estado": "abierto", "respuesta": "Quiero reabrirlo."},
        headers=headers_admin,
    )
    assert_status_code(r, 422)


# ============================================================================
# DELETE /v1/claims/{id} — Aserción de contrato (NO IMPLEMENTADO)
# ============================================================================

def test_delete_reclamo_no_implementado_devuelve_405(
    client, auth_headers, usuario_agencia
):
    """
    Aserción de contrato: la API actual NO expone DELETE sobre
    /v1/claims/{id}. El cliente debe usar el endpoint `/respond`
    con estado='resuelto' para cerrar (soft delete). Si este test
    falla, alguien agregó DELETE sin querer y debemos revisar el
    contrato.
    """
    headers, _ = auth_headers
    r_crear = client.post(
        "/v1/claims/",
        json=_payload_crear_reclamo(usuario_agencia["id_agencia"]),
        headers=headers,
    )
    id_reclamo = r_crear.json()["id_reclamo"]

    r = client.delete(f"/v1/claims/{id_reclamo}", headers=headers)
    assert r.status_code in (405, 404), (
        f"Se esperaba 405/404 para DELETE no implementado, "
        f"recibí {r.status_code}. Body: {r.text}"
    )
