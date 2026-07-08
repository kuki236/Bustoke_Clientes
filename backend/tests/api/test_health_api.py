"""
Smoke tests: verifican que el servidor esté vivo y responda en los
endpoints de descubrimiento antes de ejecutar la suite completa.

Sirven también como "canario" en CI: si `GET /` o `GET /health`
fallan, el resto de los tests van a fallar por motivos de
infraestructura y no por bugs reales.
"""

from tests.api.helpers import assert_json_keys, assert_status_code


def test_root_devuelve_info_de_la_api(client):
    """
    `GET /` expone metadatos básicos (app, versión, entorno).
    Verifica status 200 y la presencia de campos clave.
    """
    r = client.get("/")
    assert_status_code(r, 200)
    body = r.json()
    assert_json_keys(body, ["app", "version", "env", "status"])
    assert body["status"] == "ok"


def test_health_check_devuelve_ok(client):
    """
    `GET /health` debe responder 200 con `status="healthy"`. Lo usan
    los load balancers de Render para detectar instancias caídas.
    """
    r = client.get("/health")
    assert_status_code(r, 200)
    assert r.json()["status"] == "healthy"
