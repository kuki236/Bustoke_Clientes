"""
Suite 1 — Autenticación B2C: register, login, refresh, /me.

Cubre el flujo completo de credenciales del pasajero (RF-01, RF-02).
Cada test es independiente: usa la transacción con rollback
automático de la fixture `db_session`, por lo que se pueden correr
en cualquier orden sin contaminarse.
"""

from tests.api.helpers import assert_json_keys, assert_status_code


# ============================================================================
# POST /v1/auth/register
# ============================================================================

def test_register_exitoso_devuelve_201_y_token(client):
    """
    Caso feliz de registro: el endpoint crea un Usuario + Pasajero
    atómicamente y devuelve un `TokenResponse` con JWT.
    """
    payload = {
        "nombres": "Ana",
        "apellido_paterno": "Rojas",
        "apellido_materno": "Vela",
        "tipo_documento": "DNI",
        "numero_documento": "45678901",
        "telefono": "945123456",
        "email": "ana.rojas@bustoke-test.com",
        "contrasena": "MiPassword123!",
    }
    r = client.post("/v1/auth/register", json=payload)
    assert_status_code(r, 201)

    body = r.json()
    assert_json_keys(body, ["access_token", "token_type", "expires_in", "usuario"])
    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0
    # Validamos que el usuario devuelto NO exponga el hash de la contraseña.
    assert "password_hash" not in body["usuario"]
    assert body["usuario"]["email"] == payload["email"]
    assert body["usuario"]["rol"] == "cliente"
    assert body["usuario"]["activo"] is True


def test_register_email_duplicado_devuelve_409(client):
    """
    Restricción de unicidad: un segundo registro con el mismo email
    debe fallar con HTTP 409 y un mensaje legible en español.
    """
    payload = {
        "nombres": "Dup",
        "apellido_paterno": "User",
        "apellido_materno": "Test",
        "tipo_documento": "DNI",
        "numero_documento": "12345678",
        "telefono": "987654321",
        "email": "dup@bustoke-test.com",
        "contrasena": "Secret123!",
    }
    r1 = client.post("/v1/auth/register", json=payload)
    assert_status_code(r1, 201)

    r2 = client.post("/v1/auth/register", json=payload)
    assert_status_code(r2, 409)
    assert "ya está registrado" in r2.json()["detail"]


def test_register_password_corta_devuelve_422(client):
    """
    Pydantic valida `min_length=8` para la contraseña. Un password
    de 3 caracteres debe rechazarse con 422 (Unprocessable Entity).
    """
    r = client.post(
        "/v1/auth/register",
        json={
            "nombres": "X",
            "apellido_paterno": "Y",
            "apellido_materno": "Z",
            "tipo_documento": "DNI",
            "numero_documento": "11111111",
            "telefono": "911111111",
            "email": "short.pw@bustoke-test.com",
            "contrasena": "123",
        },
    )
    assert_status_code(r, 422)


def test_register_email_invalido_devuelve_422(client):
    """
    Pydantic con `EmailStr` debe rechazar formatos no-email antes
    de llegar a la lógica de negocio.
    """
    r = client.post(
        "/v1/auth/register",
        json={
            "nombres": "X",
            "apellido_paterno": "Y",
            "apellido_materno": "Z",
            "tipo_documento": "DNI",
            "numero_documento": "22222222",
            "telefono": "922222222",
            "email": "no-es-email",
            "contrasena": "Secret123!",
        },
    )
    assert_status_code(r, 422)


# ============================================================================
# POST /v1/auth/login
# ============================================================================

def test_login_exitoso_devuelve_jwt(client, registrar_usuario):
    """
    Tras registrarse, el login con las mismas credenciales debe
    emitir access_token + refresh_token.
    """
    usuario = registrar_usuario()
    r = client.post(
        "/v1/auth/login",
        json={"email": usuario["payload"]["email"], "password": usuario["payload"]["contrasena"]},
    )
    assert_status_code(r, 200)
    body = r.json()
    assert_json_keys(body, ["access_token", "refresh_token", "token_type", "usuario"])
    assert body["token_type"] == "bearer"


def test_login_password_incorrecta_devuelve_401(client, registrar_usuario):
    """
    Credenciales válidas + password erróneo → 401. No debe filtrar
    si el email existe o no (mismo código de error).
    """
    usuario = registrar_usuario()
    r = client.post(
        "/v1/auth/login",
        json={"email": usuario["payload"]["email"], "password": "Equivocada123!"},
    )
    assert_status_code(r, 401)
    assert "Credenciales" in r.json()["detail"]


def test_login_email_inexistente_devuelve_401(client):
    """
    Email que no existe → 401 (mismo que contraseña incorrecta,
    para evitar user enumeration).
    """
    r = client.post(
        "/v1/auth/login",
        json={"email": "fantasma@bustoke-test.com", "password": "cualquiera"},
    )
    assert_status_code(r, 401)


# ============================================================================
# GET /v1/auth/me
# ============================================================================

def test_me_con_jwt_valido_devuelve_perfil(client, auth_headers):
    """
    Con un JWT válido en el header `Authorization`, el endpoint
    `/me` debe retornar el perfil del usuario dueño del token.
    """
    headers, usuario = auth_headers
    r = client.get("/v1/auth/me", headers=headers)
    assert_status_code(r, 200)
    body = r.json()
    assert body["email"] == usuario["payload"]["email"]
    assert body["id_usuario"] == usuario["id_usuario"]


def test_me_sin_token_devuelve_401(client):
    """
    Sin header `Authorization`, el endpoint debe rechazar con 401.
    """
    r = client.get("/v1/auth/me")
    assert_status_code(r, 401)


def test_me_con_token_invalido_devuelve_401(client):
    """
    Un token firmado con otra clave (o malformado) debe rechazarse
    con 401, no 500.
    """
    r = client.get(
        "/v1/auth/me",
        headers={"Authorization": "Bearer token.invalido.aqui"},
    )
    assert_status_code(r, 401)


# ============================================================================
# POST /v1/auth/refresh
# ============================================================================

def test_refresh_con_refresh_token_valido_devuelve_nuevo_access(client, registrar_usuario):
    """
    El endpoint `/refresh` consume el refresh_token y emite un
    nuevo par de tokens (rotación). El nuevo access_token debe
    ser funcional en `/me`.
    """
    usuario = registrar_usuario()
    r = client.post(
        "/v1/auth/refresh",
        json={"refresh_token": usuario["refresh_token"]},
    )
    assert_status_code(r, 200)
    body = r.json()
    assert "access_token" in body

    # El nuevo access_token debe servir para llamar a /me.
    r2 = client.get(
        "/v1/auth/me",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert_status_code(r2, 200)
    assert r2.json()["id_usuario"] == usuario["id_usuario"]


def test_refresh_con_access_token_rechaza_401(client, registrar_usuario):
    """
    FIX BUG-016/021: solo se puede refrescar con un refresh_token,
    NO con un access_token. Esto evita que un atacante con un JWT
    de corta duración consiga tokens frescos indefinidamente.
    """
    usuario = registrar_usuario()
    r = client.post(
        "/v1/auth/refresh",
        json={"refresh_token": usuario["access_token"]},
    )
    assert_status_code(r, 401)


def test_refresh_con_token_malformado_devuelve_401(client):
    """
    Un token que no es JWT (o está truncado) debe rechazarse con
    401 y un mensaje que mencione "inválido".
    """
    r = client.post(
        "/v1/auth/refresh",
        json={"refresh_token": "esto-no-es-un-jwt-valido"},
    )
    assert_status_code(r, 401)
    assert "inv" in r.json()["detail"].lower()


# ============================================================================
# Migrados de la suite legacy `tests/test_auth_and_travels.py` (32 tests).
# Casos únicos no cubiertos por la suite original de `test_auth_api.py`.
# Migrados el 2026-07-11 durante la consolidación de suites.
# ============================================================================

def test_register_ignora_rol_enviado_y_siempre_es_cliente(client):
    """
    FIX BUG-009: el endpoint público B2C ignora cualquier `rol`
    enviado por el cliente y SIEMPRE crea al usuario con
    `rol='cliente'`. El blindaje contra escalación de privilegios
    se hace a nivel de esquema (campo no expuesto en el payload).
    """
    r = client.post(
        "/v1/auth/register",
        json={
            "nombres": "Admin",
            "apellido_paterno": "Root",
            "apellido_materno": "System",
            "tipo_documento": "DNI",
            "numero_documento": "00000001",
            "telefono": "900000001",
            "email": "admin.privilegios@bustoke-test.com",
            "contrasena": "Secret123!",
            "rol": "superadmin",
        },
    )
    assert_status_code(r, 201)
    assert r.json()["usuario"]["rol"] == "cliente"


def test_register_crea_fila_pasajero_atomicamente(client, db_session):
    """
    El registro debe crear SIEMPRE tanto el `Usuario` como su
    `Pasajero` asociado en la misma transacción. Si la fila
    `pasajeros` no existe, el contrato del endpoint se rompe.
    """
    from app.models import Pasajero, Usuario

    payload = {
        "nombres": "Ana",
        "apellido_paterno": "Rojas",
        "apellido_materno": "Vela",
        "tipo_documento": "DNI",
        "numero_documento": "45678901",
        "telefono": "945123456",
        "email": "ana.atomic@bustoke-test.com",
        "contrasena": "MiPassword123!",
    }
    r = client.post("/v1/auth/register", json=payload)
    assert_status_code(r, 201)

    usuario = (
        db_session.query(Usuario)
        .filter(Usuario.email == payload["email"])
        .first()
    )
    assert usuario is not None
    assert usuario.rol == "cliente"

    pasajero = (
        db_session.query(Pasajero)
        .filter(Pasajero.id_usuario == usuario.id_usuario)
        .first()
    )
    assert pasajero is not None, "El Pasajero vinculado al Usuario debe existir"
    assert pasajero.nombres == payload["nombres"]
    assert pasajero.apellido_paterno == payload["apellido_paterno"]
    assert pasajero.apellido_materno == payload["apellido_materno"]
    assert pasajero.numero_documento == payload["numero_documento"]
    assert pasajero.fecha_nacimiento is None


def test_register_tipo_documento_inexistente_devuelve_422(client):
    """
    Si el `tipo_documento` no está en el catálogo, el registro
    debe rechazarse con 422 (y NO dejar un Usuario huérfano).
    """
    payload = {
        "nombres": "Sin",
        "apellido_paterno": "Doc",
        "apellido_materno": "Raro",
        "tipo_documento": "PASAPORTE_EXTRANJERO",
        "numero_documento": "99999999",
        "telefono": "999999999",
        "email": "sin.doc@bustoke-test.com",
        "contrasena": "MiPassword123!",
    }
    r = client.post("/v1/auth/register", json=payload)
    assert_status_code(r, 422)


def test_login_enriquece_usuario_con_nombres_y_apellido_paterno(client):
    """
    El `/login` debe enriquecer `usuario` con los datos del
    pasajero vinculado (`nombres` + `apellido_paterno`) para
    que el frontend pueda mostrar el saludo sin un round-trip
    extra a `/me`.
    """
    register_payload = {
        "nombres": "Lucas",
        "apellido_paterno": "Andres",
        "apellido_materno": "Perez",
        "tipo_documento": "DNI",
        "numero_documento": "66666666",
        "telefono": "966666666",
        "email": "lucas.andres@bustoke-test.com",
        "contrasena": "MiPassword123!",
    }
    r = client.post("/v1/auth/register", json=register_payload)
    assert_status_code(r, 201)
    register_body = r.json()
    assert register_body["usuario"]["nombres"] == "Lucas"
    assert register_body["usuario"]["apellido_paterno"] == "Andres"

    login = client.post(
        "/v1/auth/login",
        json={"email": "lucas.andres@bustoke-test.com", "password": "MiPassword123!"},
    )
    assert_status_code(login, 200)
    usuario = login.json()["usuario"]
    assert usuario["nombres"] == "Lucas"
    assert usuario["apellido_paterno"] == "Andres"


def test_me_enriquece_respuesta_con_nombres_y_apellido_paterno(
    client, registrar_usuario
):
    """
    El `/me` debe enriquecer el objeto devuelto con los datos
    del pasajero vinculado, igual que `/login`.
    """
    usuario = registrar_usuario()
    r = client.get(
        "/v1/auth/me",
        headers={"Authorization": f"Bearer {usuario['access_token']}"},
    )
    assert_status_code(r, 200)
    body = r.json()
    assert body["nombres"] == "Test"
    assert body["apellido_paterno"] == "User"


def test_login_usuario_sin_pasajero_devuelve_nombres_null(client, db_session):
    """
    Si el `Usuario` no tiene `Pasajero` vinculado (caso admin
    de agencia o superadmin), los campos `nombres` y
    `apellido_paterno` deben viajar como `None` (NO explotar).
    """
    from app.core.security import hash_password
    from app.models import Usuario

    admin = Usuario(
        email="admin.legacy@bustoke-test.com",
        password_hash=hash_password("AdminPass123!"),
        telefono=None,
        rol="admin_agencia",
        id_agencia=None,
        activo=True,
    )
    db_session.add(admin)
    db_session.commit()

    r = client.post(
        "/v1/auth/login",
        json={"email": "admin.legacy@bustoke-test.com", "password": "AdminPass123!"},
    )
    assert_status_code(r, 200)
    usuario = r.json()["usuario"]
    assert usuario["rol"] == "admin_agencia"
    assert usuario["nombres"] is None
    assert usuario["apellido_paterno"] is None
