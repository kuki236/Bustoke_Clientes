"""
Seed determinista para tests E2E de Cypress.

Este script pobla una base de datos PostgreSQL (típicamente la del
job de CI de GitHub Actions) con un dataset MÍNIMO y de IDs
PREDECIBLES, necesario para que los specs de Cypress puedan:

  - `01-busqueda-viajes.cy.js`     → buscar por terminales 1 → 2
  - `02-seleccion-asientos.cy.js`  → ver el mapa del viaje #1
  - `03-flujo-completo.cy.js`      → flujo end-to-end completo

Los IDs se eligen de forma explícita y al final se reajustan las
secuencias `SERIAL` con `setval()` para que los futuros registros
que cree la app (usuarios, asientos, etc.) no colisionen.

Uso:
    python -m scripts.seed_e2e
    # o con SQLAlchemy directo:
    python scripts/seed_e2e.py

Variables de entorno (con defaults sensatos para CI):
    DB_HOST=localhost
    DB_PORT=5432
    DB_NAME=bustoke_test
    DB_USER=postgres
    DB_PASSWORD=postgres
"""

import datetime as dt
import os
import sys
from decimal import Decimal

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker


def get_database_url() -> str:
    """Construye la URL de la BD desde variables de entorno."""
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "5432")
    name = os.getenv("DB_NAME", "bustoke_test")
    user = os.getenv("DB_USER", "postgres")
    pwd = os.getenv("DB_PASSWORD", "postgres")
    return f"postgresql+psycopg2://{user}:{pwd}@{host}:{port}/{name}"


def reset_tables(session) -> None:
    """
    TRUNCATE en cascada de todas las tablas operativas. Es seguro
    correrlo múltiples veces en CI (no afecta al esquema).
    """
    tables = [
        "bloqueos_temporales", "boletos", "pagos", "reembolsos",
        "mensajes_reclamo", "reclamos", "manifiestos_sutran",
        "audit_logs", "historial_estado_viaje", "viajes",
        "tarifas_ruta", "rutas", "asientos", "buses",
        "agencias_terminales", "agencias", "terminales",
        "distritos", "provincias", "departamentos",
        "pasajeros", "usuarios", "tipos_documento",
        "liquidaciones_agencia", "suscripciones", "planes",
        "configuracion_comision", "api_keys", "tickets_soporte",
    ]
    # RESTART IDENTITY reinicia las secuencias SERIAL a 1.
    session.execute(text(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE"))


def seed_minimal_dataset(session) -> dict:
    """
    Puebla el dataset mínimo. Devuelve un dict con los IDs clave
    para que los specs de Cypress los usen (terminal 1, 2; viaje 1).
    """

    # --- Catálogo de documentos ---
    session.execute(text("""
        INSERT INTO tipos_documento (id_tipo_documento, nombre, longitud_exacta)
        VALUES
          (1, 'DNI', 8),
          (2, 'Pasaporte', NULL),
          (3, 'C.E.', 9)
    """))

    # --- Geografía ---
    session.execute(text("""
        INSERT INTO departamentos (id_departamento, nombre) VALUES
          (1, 'Lima'),
          (2, 'La Libertad')
    """))
    session.execute(text("""
        INSERT INTO provincias (id_provincia, id_departamento, nombre) VALUES
          (1, 1, 'Lima'),
          (2, 2, 'Trujillo')
    """))
    session.execute(text("""
        INSERT INTO distritos (id_distrito, id_provincia, nombre) VALUES
          (1, 1, 'La Victoria'),
          (2, 2, 'Trujillo')
    """))

    # --- Agencia ---
    session.execute(text("""
        INSERT INTO agencias (id_agencia, ruc, razon_social, estado)
        VALUES (1, '20100234561', 'CRUZ DEL SUR S.A.C.', 'activa')
    """))

    # --- Terminales (IDs 1 y 2 son los que usan los specs de Cypress) ---
    session.execute(text("""
        INSERT INTO terminales (id_terminal, id_distrito, nombre, direccion) VALUES
          (1, 1, 'Terminal Lima Centro', 'Av. Javier Prado 1109'),
          (2, 2, 'Terminal Trujillo',     'Panamericana Norte Km 558')
    """))

    # --- Ruta Lima → Trujillo ---
    session.execute(text("""
        INSERT INTO rutas (id_ruta, id_agencia, id_terminal_origen, id_terminal_destino, tarifa_base)
        VALUES (1, 1, 1, 2, 70.00)
    """))

    # --- Tarifas por tipo de servicio ---
    session.execute(text("""
        INSERT INTO tarifas_ruta (id_tarifa, id_ruta, tipo_servicio, precio) VALUES
          (1, 1, 'normal', 75.00),
          (2, 1, 'vip',    110.00)
    """))

    # --- Bus con 5 asientos ---
    session.execute(text("""
        INSERT INTO buses (id_bus, id_agencia, placa, cantidad_pisos)
        VALUES (1, 1, 'ABC-123', 1)
    """))

    # --- Asientos (formato 'A1-1' requerido por chk_formato_asiento) ---
    session.execute(text("""
        INSERT INTO asientos
          (id_asiento, id_bus, numero_asiento, fila, piso, tipo_servicio,
           coord_x, coord_y, bloqueado_manual)
        VALUES
          (1, 1, 'A1-1', 'A', 1, 'normal',  20, 30, FALSE),
          (2, 1, 'B1-1', 'B', 1, 'normal',  40, 30, FALSE),
          (3, 1, 'C1-1', 'C', 1, 'normal',  60, 30, FALSE),
          (4, 1, 'D1-1', 'D', 1, 'normal',  80, 30, FALSE),
          (5, 1, 'E1-1', 'E', 1, 'normal', 100, 30, FALSE)
    """))

    # --- Viaje #1 para mañana a las 08:00 (necesario para seat selection) ---
    fecha_salida = dt.date.today() + dt.timedelta(days=1)
    salida = dt.datetime.combine(fecha_salida, dt.time(8, 0))
    llegada = salida + dt.timedelta(hours=8)
    session.execute(
        text("""
            INSERT INTO viajes
              (id_viaje, id_ruta, id_bus, fecha_hora_salida,
               fecha_hora_llegada, estado, rampa_embarque)
            VALUES (:id_viaje, :id_ruta, :id_bus, :salida, :llegada,
                    'programado', 'Rampa 3')
        """),
        {
            "id_viaje": 1,
            "id_ruta": 1,
            "id_bus": 1,
            "salida": salida,
            "llegada": llegada,
        },
    )

    # --- (Opcional) Pasajero semilla para tests de claims si se necesitan ---
    # No se incluye aquí porque cada spec de Cypress registra su propio
    # pasajero vía API (cy.registrarPasajero). Esto evita conflictos
    # de unicidad entre ejecuciones consecutivas del CI.

    return {
        "id_terminal_origen": 1,
        "id_terminal_destino": 2,
        "id_viaje": 1,
        "fecha_salida": fecha_salida.isoformat(),
    }


def reset_sequences(session, table_max_ids: dict) -> None:
    """
    Reinicia las secuencias SERIAL de PostgreSQL al MAX(id) actual + 1,
    para que futuros INSERTs sin ID explícito no colisionen con los
    IDs fijos que acabamos de insertar.
    """
    for table, max_id in table_max_ids.items():
        session.execute(
            text(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), :next_val)"),
            {"next_val": max_id + 1},
        )


def main() -> int:
    url = get_database_url()
    print(f"[seed_e2e] Conectando a {url.split('@')[-1]} (ocultando credenciales)")

    engine = create_engine(url, future=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        reset_tables(session)
        session.commit()
        print("[seed_e2e] Tablas truncadas.")

        ids = seed_minimal_dataset(session)
        session.commit()
        print(f"[seed_e2e] Dataset insertado: {ids}")

        # Ajustar secuencias SERIAL para evitar colisiones futuras.
        reset_sequences(session, {
            "tipos_documento": 3,
            "departamentos": 2,
            "provincias": 2,
            "distritos": 2,
            "agencias": 1,
            "terminales": 2,
            "rutas": 1,
            "tarifas_ruta": 2,
            "buses": 1,
            "asientos": 5,
            "viajes": 1,
        })
        session.commit()
        print("[seed_e2e] Secuencias SERIAL reajustadas.")
        return 0
    except Exception as exc:
        session.rollback()
        print(f"[seed_e2e] ERROR: {exc}", file=sys.stderr)
        return 1
    finally:
        session.close()
        engine.dispose()


if __name__ == "__main__":
    sys.exit(main())
