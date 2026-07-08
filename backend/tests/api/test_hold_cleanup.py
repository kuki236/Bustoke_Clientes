"""
Suite para el job de limpieza de holds expirados (TC-RB-003).

Este job, definido en `app/main.py::hold_cleanup_loop`, evita la
acumulación de holds zombie tras cierres abruptos del navegador
donde el `releaseHoldsBeacon` del frontend nunca se envía
(kill -9, crash, pérdida de red).

La cobertura de esta suite se divide en tres niveles:

1. **Unidad del repositorio** — `SeatRepository.cleanup_expired_holds`
   marca correctamente los holds vencidos.
2. **Lógica de scheduling** — `hold_cleanup_loop` ejecuta el trabajo
   en background y respeta la señal de stop.
3. **Integración con el lifespan** — cuando `HOLD_CLEANUP_DISABLED=false`,
   la app expone la task y el `stop_event` en `app.state`.
"""

import asyncio
import datetime as dt

import pytest
from sqlalchemy import select

from app.models import BloqueoTemporal
from app.repositories.seat_repository import SeatRepository


# ============================================================================
# Tests del repositorio (nivel más bajo)
# ============================================================================

def _crear_hold(
    db_session,
    *,
    id_viaje: int,
    id_asiento: int,
    token_sesion: str = "sess-test",
    expira_at: dt.datetime | None = None,
) -> BloqueoTemporal:
    """Helper: inserta un BloqueoTemporal con la expiración indicada."""
    now = dt.datetime.now(dt.timezone.utc)
    if expira_at is None:
        expira_at = now + dt.timedelta(minutes=10)
    hold = BloqueoTemporal(
        id_viaje=id_viaje,
        id_asiento=id_asiento,
        token_sesion=token_sesion,
        fecha_bloqueo=now,
        expira_at=expira_at,
        estado="activo",
    )
    db_session.add(hold)
    db_session.flush()
    return hold


def _ids_asientos_del_bus(db_session, id_bus: int) -> list[int]:
    """Helper: retorna los id_asiento del bus ordenados por id."""
    from app.models import Asiento

    stmt = (
        select(Asiento.id_asiento)
        .where(Asiento.id_bus == id_bus)
        .order_by(Asiento.id_asiento.asc())
    )
    return list(db_session.scalars(stmt).all())


def test_cleanup_marca_como_expirado_los_holds_vencidos(
    db_session, seed_basico
):
    """
    `SeatRepository.cleanup_expired_holds()` debe marcar como
    `estado='expirado'` todos los holds con `expira_at <= NOW()`.
    Holds aún vigentes deben permanecer en `estado='activo'`.
    """
    data = seed_basico()
    id_viaje = data["id_viaje"]
    id_asientos = _ids_asientos_del_bus(db_session, data["id_bus"])
    assert len(id_asientos) >= 3

    now = dt.datetime.now(dt.timezone.utc)

    # Hold 1: vencido hace 1 minuto → debe marcarse expirado.
    hold_vencido = _crear_hold(
        db_session,
        id_viaje=id_viaje,
        id_asiento=id_asientos[0],
        token_sesion="vencido-1",
        expira_at=now - dt.timedelta(minutes=1),
    )
    # Hold 2: vence exactamente ahora (en el límite).
    hold_limite = _crear_hold(
        db_session,
        id_viaje=id_viaje,
        id_asiento=id_asientos[1],
        token_sesion="limite",
        expira_at=now,
    )
    # Hold 3: vence en 1 hora → debe seguir activo.
    hold_vigente = _crear_hold(
        db_session,
        id_viaje=id_viaje,
        id_asiento=id_asientos[2],
        token_sesion="vigente",
        expira_at=now + dt.timedelta(hours=1),
    )

    repo = SeatRepository(db_session)
    cleaned = repo.cleanup_expired_holds()

    assert cleaned == 2, (
        f"Se esperaban 2 holds marcados como expirados, se marcaron {cleaned}"
    )
    db_session.expire_all()

    def _estado(hold_id: int) -> str:
        h = db_session.get(BloqueoTemporal, hold_id)
        assert h is not None
        return h.estado

    assert _estado(hold_vencido.id_bloqueo) == "expirado"
    assert _estado(hold_limite.id_bloqueo) == "expirado"
    assert _estado(hold_vigente.id_bloqueo) == "activo"


def test_cleanup_no_toca_holds_ya_liberados_o_convertidos(
    db_session, seed_basico
):
    """
    El job SOLO debe actuar sobre holds en `estado='activo'`. Holds
    ya marcados como `liberado` o `convertido` quedan como están.
    """
    data = seed_basico()
    id_viaje = data["id_viaje"]
    id_asientos = _ids_asientos_del_bus(db_session, data["id_bus"])
    now = dt.datetime.now(dt.timezone.utc)

    # Hold liberado con expira_at vencida: NO se debe tocar.
    hold_liberado = _crear_hold(
        db_session,
        id_viaje=id_viaje,
        id_asiento=id_asientos[0],
        token_sesion="liberado",
        expira_at=now - dt.timedelta(minutes=5),
    )
    hold_liberado.estado = "liberado"

    # Hold convertido con expira_at vencida: NO se debe tocar.
    hold_convertido = _crear_hold(
        db_session,
        id_viaje=id_viaje,
        id_asiento=id_asientos[1],
        token_sesion="convertido",
        expira_at=now - dt.timedelta(minutes=5),
    )
    hold_convertido.estado = "convertido"

    db_session.flush()

    repo = SeatRepository(db_session)
    cleaned = repo.cleanup_expired_holds()

    assert cleaned == 0
    db_session.expire_all()
    assert db_session.get(BloqueoTemporal, hold_liberado.id_bloqueo).estado == "liberado"
    assert db_session.get(BloqueoTemporal, hold_convertido.id_bloqueo).estado == "convertido"


def test_cleanup_devuelve_cero_si_no_hay_holds_vencidos(db_session, seed_basico):
    """
    Cuando no hay holds para limpiar, el método retorna 0 sin error.
    """
    seed_basico()
    repo = SeatRepository(db_session)
    cleaned = repo.cleanup_expired_holds()
    assert cleaned == 0


# ============================================================================
# Tests del loop asyncio
# ============================================================================

def test_hold_cleanup_loop_ejecuta_y_respeta_stop(
    monkeypatch, seed_basico
):
    """
    El loop debe:
    1. Ejecutar la limpieza periódicamente.
    2. Detenerse limpiamente cuando se setea el `stop_event`.

    Para evitar tocar la BD de tests (que comparte engine con
    pytest y rompería el rollback transaccional), parcheamos
    `_run_hold_cleanup_once` con un no-op que cuenta las
    invocaciones. La cobertura real del UPDATE se valida en los
    tests del repositorio (`test_cleanup_marca_como_expirado_*`).
    """
    from app.main import hold_cleanup_loop
    from app.core.config import settings
    import app.main as main_module

    seed_basico()

    # Reducimos el intervalo a 1s para que el test no tarde.
    monkeypatch.setattr(settings, "HOLD_CLEANUP_INTERVAL_SECONDS", 1)

    call_count = {"n": 0}

    def fake_cleanup():
        call_count["n"] += 1
        return 0

    monkeypatch.setattr(main_module, "_run_hold_cleanup_once", fake_cleanup)

    async def _runner():
        stop_event = asyncio.Event()
        task = asyncio.create_task(hold_cleanup_loop(stop_event))
        # Damos tiempo al loop para hacer al menos 2 pasadas.
        await asyncio.sleep(2.5)
        stop_event.set()
        await asyncio.wait_for(task, timeout=5.0)

    asyncio.run(_runner())

    assert call_count["n"] >= 2, (
        f"El loop debería haber invocado _run_hold_cleanup_once "
        f"al menos 2 veces, lo hizo {call_count['n']} vez/veces"
    )


def test_hold_cleanup_loop_continua_despues_de_error(
    monkeypatch, db_session, seed_basico
):
    """
    Si una iteración del loop lanza una excepción (p.ej. DB
    caída momentáneamente), el job debe LOGUEAR el error y
    continuar con la siguiente iteración sin tumbar la app.
    """
    from app.main import hold_cleanup_loop
    from app.core.config import settings

    seed_basico()

    # Forzamos un error en la primera llamada y restauramos en la
    # segunda. Usamos monkeypatch sobre el módulo `app.main`.
    import app.main as main_module

    original = main_module._run_hold_cleanup_once
    call_count = {"n": 0}

    def flaky():
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise RuntimeError("DB caída (simulado)")
        return original()

    monkeypatch.setattr(main_module, "_run_hold_cleanup_once", flaky)
    monkeypatch.setattr(settings, "HOLD_CLEANUP_INTERVAL_SECONDS", 1)

    async def _runner():
        stop_event = asyncio.Event()
        task = asyncio.create_task(hold_cleanup_loop(stop_event))
        # Esperamos a que el loop ejecute al menos 2 pasadas.
        await asyncio.sleep(2.5)
        stop_event.set()
        await asyncio.wait_for(task, timeout=5.0)

    asyncio.run(_runner())

    assert call_count["n"] >= 2, (
        f"El loop debería haber continuado tras el error, "
        f"solo se ejecutó {call_count['n']} vez/veces"
    )


# ============================================================================
# Test de integración: el lifespan registra la task cuando NO está deshabilitada
# ============================================================================

def test_lifespan_registra_task_cuando_cleanup_habilitado(monkeypatch):
    """
    Cuando `HOLD_CLEANUP_DISABLED=false`, el lifespan de la app
    debe crear una `asyncio.Task` para `hold_cleanup_loop` y
    exponerla en `app.state` junto al `stop_event`.

    Implementación:
    - `monkeypatch.setattr(app.main, "settings", fresh)` cambia
      la lectura de `settings.HOLD_CLEANUP_DISABLED` que hace el
      lifespan en tiempo de ejecución.
    - `monkeypatch.setattr(app.main, "_run_hold_cleanup_once",
      noop)` evita que la task intente usar el `engine` de
      producción (que apunta a la BD real, no a la de tests).
    - Invocamos el `lifespan(app)` directamente con `asyncio.run`
      para no depender del `TestClient` global del conftest.
    - Verificamos que `app.state.hold_cleanup_task` y
      `hold_cleanup_stop` se populan DENTRO del lifespan (usando
      un mock-fastapi-app con el mismo `state` que el real).
    """
    from app.core import config as config_module
    from app.core.config import Settings
    import app.main as main_module
    from fastapi import FastAPI

    # Forzamos `HOLD_CLEANUP_DISABLED=False` creando un Settings
    # fresco (el singleton cacheado en conftest sigue siendo `True`).
    config_module.get_settings.cache_clear()
    monkeypatch.setenv("HOLD_CLEANUP_DISABLED", "false")
    fresh_settings = Settings()
    assert fresh_settings.HOLD_CLEANUP_DISABLED is False

    # Reemplazamos la referencia a `settings` que usará el lifespan.
    monkeypatch.setattr(config_module, "settings", fresh_settings)
    monkeypatch.setattr(main_module, "settings", fresh_settings)

    # Neutralizamos la pasada de limpieza: la task no debe tocar la
    # BD de producción. Solo verificamos que arranca y se detiene.
    def _noop():
        return 0
    monkeypatch.setattr(main_module, "_run_hold_cleanup_once", _noop)

    # Usamos una mini-app con su propio `state` para no contaminar
    # la app global del conftest. lifespan(app) recibe un FastAPI
    # genérico.
    mini_app = FastAPI()
    captured: dict = {}

    async def _runner():
        async with main_module.lifespan(mini_app):
            # Dentro del lifespan: la task y el stop_event deben
            # estar en `mini_app.state`.
            captured["task"] = getattr(mini_app.state, "hold_cleanup_task", None)
            captured["stop"] = getattr(mini_app.state, "hold_cleanup_stop", None)
            # Damos tiempo a la task a arrancar (puede ser necesario
            # en CI donde el scheduling sea lento).
            await asyncio.sleep(0.2)

    asyncio.run(_runner())

    assert captured.get("task") is not None, (
        "El lifespan NO creó la task de cleanup con "
        "HOLD_CLEANUP_DISABLED=False. ¿El patch de settings no "
        "se aplicó a `app.main`?"
    )
    assert captured.get("stop") is not None
    assert isinstance(captured["task"], asyncio.Task)
    assert isinstance(captured["stop"], asyncio.Event)
    # La task debe haber terminado al salir del lifespan.
    assert captured["task"].done()


def test_lifespan_NO_crea_task_cuando_cleanup_deshabilitado(client):
    """
    El conftest setea `HOLD_CLEANUP_DISABLED=true`. El lifespan NO
    debe crear la task de cleanup ni poblar `app.state`.
    """
    from app.main import app

    assert getattr(app.state, "hold_cleanup_task", None) is None
    assert getattr(app.state, "hold_cleanup_stop", None) is None
