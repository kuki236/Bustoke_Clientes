"""
Suite de Bookings — proceso consolidado de compra y emisión de boletos
(RF-02 guest, RF-07).

Esta suite cubre los flujos críticos del checkout, con foco en las
mitigaciones de riesgo documentadas en el TEST_PLAN:

- **TC-BB-017**: booking sin aceptar términos → 409.
- **TC-BB-018**: booking sin hold vigente → 409.
- **TC-BB-019**: guest checkout (sin Authorization header) → 201.
- **TC-RB-002**: idempotencia de `mp_payment_id`. Un reintento
  del mismo `payment_id` de Mercado Pago debe rechazarse con 409
  en lugar de generar un cobro / boleto duplicado.
"""

import datetime as dt
from typing import Any, Dict

import pytest

from tests.api.helpers import assert_json_keys, assert_status_code


# ============================================================================
# FIXTURES LOCALES
# ============================================================================

@pytest.fixture
def dni_tipo_documento_id(db_session) -> int:
    """
    Retorna el `id_tipo_documento` del DNI sembrado por la fixture
    `db_session` (que siempre inserta DNI al inicio de cada test
    después del TRUNCATE). El ID lo asigna PostgreSQL por la
    secuencia del serial, así que lo consultamos dinámicamente.
    """
    from app.models import TipoDocumento

    tipo = db_session.query(TipoDocumento).filter(TipoDocumento.nombre == "DNI").first()
    assert tipo is not None, "DNI no fue sembrado por _seed_catalogo_documentos"
    return tipo.id_tipo_documento


@pytest.fixture
def viaje_para_booking(client, seed_basico, dni_tipo_documento_id) -> Dict[str, Any]:
    """
    Siembra el viaje base + retorna los IDs primitivos y un asiento
    libre con un hold activo bajo el `token_sesion='sess-booking'`.
    Listo para invocar `POST /v1/bookings/process` sin más
    preparativos.
    """
    data = seed_basico()
    # Recuperamos los IDs de los asientos.
    r = client.get(f"/v1/travels/{data['id_viaje']}/seats")
    assert_status_code(r, 200)
    asientos = r.json()["asientos"]
    id_asiento = asientos[0]["id_asiento"]

    # Creamos un hold sobre ese asiento bajo el token que usaremos
    # en el booking. La response es irrelevante para los asserts.
    r_hold = client.post(
        "/v1/seats/hold",
        json={
            "id_viaje": data["id_viaje"],
            "id_asiento": id_asiento,
            "token_sesion": "sess-booking",
        },
    )
    assert_status_code(r_hold, 201)

    return {
        **data,
        "id_tipo_documento": dni_tipo_documento_id,
        "id_asiento": id_asiento,
        "id_asientos": [a["id_asiento"] for a in asientos],
    }


def _build_booking_payload(
    *,
    id_viaje: int,
    id_asiento: int,
    id_tipo_documento: int,
    metodo_pago: str = "tarjeta",
    mp_payment_id: int | None = None,
    acepto_terminos_politicas: bool = True,
    token_sesion: str = "sess-booking",
) -> Dict[str, Any]:
    """
    Construye un payload válido para `POST /v1/bookings/process`.
    Los datos del pasajero son deterministas (mismo DNI siempre)
    para que las pruebas sean repetibles.
    """
    payload: Dict[str, Any] = {
        "token_sesion": token_sesion,
        "id_viaje": id_viaje,
        "comprador": {
            "tipo_documento": "DNI",
            "numero_documento": "72145639",
            "nombres": "Carlos",
            "apellidos": "Mendoza Quispe",
            "email": "carlos.mendoza.booking@bustoke-test.com",
        },
        "pasajeros": [
            {
                "id_asiento": id_asiento,
                "id_tipo_documento": id_tipo_documento,
                "numero_documento": "72145639",
                "nombres": "Carlos",
                "apellido_paterno": "Mendoza",
                "apellido_materno": "Quispe",
                "fecha_nacimiento": "1992-05-14",
            }
        ],
        "metodo_pago": metodo_pago,
        "acepto_terminos_politicas": acepto_terminos_politicas,
    }
    if mp_payment_id is not None:
        payload["mp_payment_id"] = mp_payment_id
    return payload


# ============================================================================
# TC-BB-017: Booking sin aceptar términos
# ============================================================================

def test_booking_sin_aceptar_terminos_devuelve_409(
    client, viaje_para_booking
):
    """
    El comprador debe aceptar los términos y políticas para que
    el backend procese el pago. Sin aceptación, 409.
    """
    data = viaje_para_booking
    payload = _build_booking_payload(
        id_viaje=data["id_viaje"],
        id_asiento=data["id_asiento"],
        id_tipo_documento=data["id_tipo_documento"],
        acepto_terminos_politicas=False,
    )
    r = client.post("/v1/bookings/process", json=payload)
    assert_status_code(r, 409)
    assert "términos" in r.json()["detail"].lower()


# ============================================================================
# TC-BB-018: Booking sin hold vigente
# ============================================================================

def test_booking_sin_hold_vigente_devuelve_409(
    client, viaje_para_booking
):
    """
    Si el `token_sesion` no tiene bloqueos activos, el booking debe
    rechazarse con 409. Usamos un token distinto al que creó el
    hold en el fixture.
    """
    data = viaje_para_booking
    payload = _build_booking_payload(
        id_viaje=data["id_viaje"],
        id_asiento=data["id_asiento"],
        id_tipo_documento=data["id_tipo_documento"],
        token_sesion="sess-inexistente",
    )
    r = client.post("/v1/bookings/process", json=payload)
    assert_status_code(r, 409)
    assert "bloqueo" in r.json()["detail"].lower()


# ============================================================================
# TC-BB-019: Guest checkout
# ============================================================================

def test_booking_sin_auth_funciona_como_guest(
    client, viaje_para_booking
):
    """
    RF-02: el booking es público. Sin Authorization, el boleto se
    emite con `id_usuario=NULL` y `email_contacto` del comprador.
    """
    data = viaje_para_booking
    payload = _build_booking_payload(
        id_viaje=data["id_viaje"],
        id_asiento=data["id_asiento"],
        id_tipo_documento=data["id_tipo_documento"],
        metodo_pago="yape",
    )
    r = client.post("/v1/bookings/process", json=payload)
    assert_status_code(r, 201)
    body = r.json()
    assert_json_keys(body, [
        "codigo_reserva", "id_viaje", "total",
        "estado", "pago", "boletos",
    ])
    assert body["estado"] == "confirmada"
    assert len(body["boletos"]) == 1
    # El método de pago es yape (no tarjeta), por lo que NO lleva
    # referencia "MP-...".
    assert body["pago"]["metodo"] == "yape"
    assert not body["pago"]["referencia_transaccion"].startswith("MP-")


# ============================================================================
# TC-RB-002: Idempotencia de mp_payment_id
# ============================================================================

def test_booking_con_mp_payment_id_duplicado_devuelve_409(
    client, viaje_para_booking
):
    """
    Si el frontend reintenta el booking con el mismo `mp_payment_id`,
    el backend debe detectar la colisión y responder 409 con un
    mensaje que mencione el `mp_payment_id` para que el equipo de
    soporte pueda rastrear el pago.

    Cobertura:
    1. Primer POST con `mp_payment_id=12345` → 201.
    2. Segundo POST con `mp_payment_id=12345` → 409, mensaje
       contiene "12345" y "ya fue procesado".
    """
    data = viaje_para_booking
    payload_1 = _build_booking_payload(
        id_viaje=data["id_viaje"],
        id_asiento=data["id_asiento"],
        id_tipo_documento=data["id_tipo_documento"],
        metodo_pago="tarjeta",
        mp_payment_id=12345,
    )

    # 1) Primer intento: 201 y se crea un boleto.
    r1 = client.post("/v1/bookings/process", json=payload_1)
    assert_status_code(r1, 201)
    body_1 = r1.json()
    assert body_1["pago"]["referencia_transaccion"] == "MP-12345"

    # 2) Segundo intento con el MISMO mp_payment_id: 409.
    r2 = client.post("/v1/bookings/process", json=payload_1)
    assert_status_code(r2, 409)
    detail = r2.json()["detail"]
    assert "12345" in detail, (
        f"El mensaje de error debe mencionar el mp_payment_id para "
        f"trazabilidad de soporte. Detalle: {detail!r}"
    )
    assert "ya fue procesado" in detail.lower()


def test_booking_con_mp_payment_id_distinto_funciona_independiente(
    client, viaje_para_booking
):
    """
    Complemento del test de idempotencia: dos bookings con
    `mp_payment_id` DISTINTOS deben procesarse normalmente (cada
    uno genera su propio pago y boleto). Esto garantiza que la
    validación de duplicados es específica al `mp_payment_id`, no
    un bloqueo global sobre el método 'tarjeta'.
    """
    data = viaje_para_booking

    # Booking #1 sobre el asiento 0 (ya está con hold del fixture).
    payload_1 = _build_booking_payload(
        id_viaje=data["id_viaje"],
        id_asiento=data["id_asientos"][0],
        id_tipo_documento=data["id_tipo_documento"],
        metodo_pago="tarjeta",
        mp_payment_id=99001,
    )
    r1 = client.post("/v1/bookings/process", json=payload_1)
    assert_status_code(r1, 201)

    # Necesitamos un segundo hold sobre OTRO asiento para el segundo
    # booking. Lo creamos en línea.
    r_hold = client.post(
        "/v1/seats/hold",
        json={
            "id_viaje": data["id_viaje"],
            "id_asiento": data["id_asientos"][1],
            "token_sesion": "sess-booking",
        },
    )
    assert_status_code(r_hold, 201)

    # Booking #2 sobre el asiento 1 con un mp_payment_id distinto.
    payload_2 = _build_booking_payload(
        id_viaje=data["id_viaje"],
        id_asiento=data["id_asientos"][1],
        id_tipo_documento=data["id_tipo_documento"],
        metodo_pago="tarjeta",
        mp_payment_id=99002,
    )
    r2 = client.post("/v1/bookings/process", json=payload_2)
    assert_status_code(r2, 201)
    assert r2.json()["pago"]["referencia_transaccion"] == "MP-99002"


def test_booking_con_mp_payment_id_yape_no_se_considera_duplicado(
    client, viaje_para_booking
):
    """
    La validación de idempotencia SOLO aplica a `metodo_pago='tarjeta'`.
    Un booking con `metodo_pago='yape'` y sin `mp_payment_id` debe
    procesarse sin activar el check de duplicados (que requiere
    explícitamente ambos: método tarjeta + mp_payment_id presente).
    """
    data = viaje_para_booking
    payload = _build_booking_payload(
        id_viaje=data["id_viaje"],
        id_asiento=data["id_asiento"],
        id_tipo_documento=data["id_tipo_documento"],
        metodo_pago="yape",
    )
    r = client.post("/v1/bookings/process", json=payload)
    assert_status_code(r, 201)
