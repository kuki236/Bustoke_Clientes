"""
Migración de fixes críticos del Módulo 1 (B2C) — 2026-06-21.

Aplica al esquema de PostgreSQL existente los fixes identificados
en la auditoría SQA:

- BUG-041  : índice único PARCIAL sobre (id_viaje, id_asiento)
              WHERE estado='activo' (anti-overbooking de holds).
- BUG-002  : índice único case-insensitive sobre LOWER(email).
- BUG-111  : DEFAULT FALSE en `acepto_terminos_politicas`.
- XBUG-026 : reemplazo de hashes bcrypt de seed por el hash
              compartido `pass1234` para que las cuentas demo
              puedan autenticarse.

Uso (desde la raíz del proyecto):
    cd backend
    python scripts/migrate_2026_06_21_critical_fixes.py

Lee credenciales desde `backend/.env` (no requiere dependencias
extra de Python). Internamente delega a `psql` (cliente nativo
de PostgreSQL), que es lo único que necesita estar instalado y
en PATH. Si `psql` no está disponible, podés copiar y pegar
los SQL de este archivo manualmente.

La migración es IDEMPOTENTE: usa `IF NOT EXISTS` para DDL y
solo actualiza hashes que NO coincidan con el destino.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path


# ----------------------------------------------------------------------------
# Hash bcrypt para "pass1234" (cost=12)
# Verificado: bcrypt.checkpw(b"pass1234", hash_bytes) == True
# ----------------------------------------------------------------------------
SHARED_DEMO_PASSWORD_HASH = (
    "$2b$12$M5z5eOr07ydTPlLqY0LZY.CcF1fh1owzSfHKuP0.oknqIwV59zZbi"
)


def load_env_file(env_path: Path) -> dict[str, str]:
    """
    Parsea manualmente un .env (formato KEY=VALUE, # comentarios).
    No requiere python-dotenv.
    """
    env: dict[str, str] = {}
    if not env_path.exists():
        return env
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        # Quita comillas opcionales
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        env[key] = value
    return env


def resolve_db_params() -> dict[str, str]:
    """
    Lee credenciales priorizando vars de entorno del shell; si no
    existen, busca en `backend/.env`. Devuelve siempre todas las
    claves con default razonable (los del .env.example).
    """
    backend_root = Path(__file__).resolve().parent.parent
    env = load_env_file(backend_root / ".env")

    def pick(key: str, default: str) -> str:
        return os.environ.get(key) or env.get(key) or default

    return {
        "host": pick("DB_HOST", "localhost"),
        "port": pick("DB_PORT", "5432"),
        "name": pick("DB_NAME", "bustoke_db"),
        "user": pick("DB_USER", "postgres"),
        "password": pick("DB_PASSWORD", "postgres"),
    }


# Cada statement: (id, ddl_sql, descripción, run_in_autocommit)
# IMPORTANTE: en estos SQL NO usamos $$ porque entrarían en conflicto
# con la sintaxis de psql. Usamos comillas simples y bindparams :p1/:p2.
# `run_in_autocommit` es True para DDL que no puede ir dentro de
# transacción (e.g. ALTER TYPE ADD VALUE en versiones viejas de PG).
STATEMENTS: list[tuple[str, str, str, bool]] = [
    (
        "idx_uq_bloqueo_activo",
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_bloqueo_activo_viaje_asiento
            ON bloqueos_temporales (id_viaje, id_asiento)
            WHERE estado = 'activo';
        """,
        "Índice único parcial anti-overbooking (BUG-041)",
        False,
    ),
    (
        "idx_uq_email_lower",
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_email_lower
            ON usuarios (LOWER(email));
        """,
        "Índice único case-insensitive sobre email (BUG-002/020)",
        False,
    ),
    (
        "fix_enum_liberado",
        # FIX bug "deselect deja hold zombie": el backend hacía
        # `UPDATE bloqueos_temporales SET estado = 'liberado'`
        # pero el ENUM `estado_bloqueo_temporal` solo tenía
        # ('activo','expirado','convertido'). PostgreSQL rechazaba
        # la escritura con error 22P02, el try/except del repo lo
        # silenciaba, el hold quedaba activo, y el usuario veía
        # los asientos "bloqueados" para siempre.
        #
        # ALTER TYPE ... ADD VALUE IF NOT EXISTS requiere PostgreSQL
        # 12+. En versiones anteriores hay que correrlo a mano sin
        # transacción. En cualquier caso, es idempotente.
        """
        ALTER TYPE estado_bloqueo_temporal ADD VALUE IF NOT EXISTS 'liberado';
        """,
        "FIX bug deselect zombie: agregar 'liberado' al ENUM",
        True,  # autocommit: ADD VALUE no funciona en transacción en PG < 12
    ),
    (
        "fix_acepto_terminos_default",
        """
        DO $do$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'boletos'
                  AND column_name = 'acepto_terminos_politicas'
                  AND column_default IS DISTINCT FROM 'false'
            ) THEN
                ALTER TABLE boletos
                    ALTER COLUMN acepto_terminos_politicas SET DEFAULT FALSE;
            END IF;
        END $do$;
        """,
        "Default FALSE en acepto_terminos_politicas (BUG-111)",
        False,
    ),
    (
        "fix_demo_passwords",
        # Idempotente: solo actualiza hashes que no son el destino.
        # Filtra además los hashes truncados/fake del seed (length < 50).
        # Los placeholders {target_hash}, {fake1}, {fake2} se sustituyen
        # a nivel de Python con format() (es solo DML interno, no
        # viene del usuario). {fake1} y {fake2} usan SQL LIKE patterns
        # con % como wildcard, por eso quedan tal cual en el SQL.
        """
        UPDATE usuarios
        SET password_hash = '{target_hash}'
        WHERE password_hash IS DISTINCT FROM '{target_hash}'
          AND (
            password_hash LIKE '{fake1}'
            OR password_hash LIKE '{fake2}'
            OR LENGTH(password_hash) < 50
          );
        """,
        "Hashes bcrypt demo -> pass1234 (XBUG-026)",
        False,
    ),
]


def find_psql() -> str | None:
    """
    Localiza el binario `psql`. Primero busca en PATH; si no está,
    rastrea rutas comunes de Windows (PostgreSQL 18/17/16/15/14
    en `C:\\Program Files\\PostgreSQL\\`).
    """
    found = shutil.which("psql")
    if found:
        return found
    # Rutas comunes en Windows
    pg_root = Path(r"C:\Program Files\PostgreSQL")
    if pg_root.exists():
        for version_dir in sorted(pg_root.iterdir(), reverse=True):
            candidate = version_dir / "bin" / ("psql.exe" if os.name == "nt" else "psql")
            if candidate.exists():
                return str(candidate)
    return None


def run_one(
    name: str,
    sql_text: str,
    description: str,
    params: dict[str, str],
    autocommit: bool = False,
) -> bool:
    """
    Ejecuta un statement con `psql`.
    `autocommit=True` desactiva la transacción implícita (necesario
    para `ALTER TYPE ADD VALUE` en algunas versiones de PG).
    """
    print(f"\n-> [{name}] {description}")
    psql = find_psql()
    if psql is None:
        print(
            "   ERROR: psql no encontrado en PATH ni en C:\\Program Files\\PostgreSQL. "
            "Instalá PostgreSQL client tools o copiá los SQL manualmente."
        )
        return False

    # Sustitución de placeholders {target_hash} / {fake1} / {fake2}
    # a nivel de Python. El hash bcrypt no contiene comillas simples
    # (solo `[A-Za-z0-9./$]`), así que es seguro inlinearlo en el SQL.
    sql_final = sql_text.format(
        target_hash=SHARED_DEMO_PASSWORD_HASH,
        fake1="$2b$12$%...",
        fake2="$2b$12$_mock_hash_%%",  # %% escapa el % en format()
    )

    cmd = [
        psql,
        "-h", params["host"],
        "-p", params["port"],
        "-U", params["user"],
        "-d", params["name"],
        "--set", "ON_ERROR_STOP=1",
        "--echo-errors",
        "-q",
        "-c", sql_final,
    ]
    if autocommit:
        # En algunas versiones de PostgreSQL, ALTER TYPE ... ADD VALUE
        # no puede ejecutarse dentro de un bloque de transacción
        # implícito que psql abre con -c. Usamos --set AUTOCOMMIT=on
        # para forzar autocommit en este caso.
        cmd.append("--set=AUTOCOMMIT=on")
    env = os.environ.copy()
    env["PGPASSWORD"] = params["password"]

    try:
        result = subprocess.run(
            cmd,
            env=env,
            check=False,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            print(f"   ERROR (psql exit {result.returncode}):")
            if result.stdout:
                print(f"     stdout: {result.stdout.strip()}")
            if result.stderr:
                print(f"     stderr: {result.stderr.strip()}")
            return False

        # Para el UPDATE de passwords, psql con -q no imprime rowcount.
        # Hacemos un follow-up SELECT para confirmar.
        if name == "fix_demo_passwords":
            count_cmd = [
                psql,
                "-h", params["host"],
                "-p", params["port"],
                "-U", params["user"],
                "-d", params["name"],
                "-tAc",  # tuples-only, aligned, sin header, sin footer
                f"SELECT COUNT(*) FROM usuarios WHERE password_hash = '{SHARED_DEMO_PASSWORD_HASH}';",
            ]
            count_env = os.environ.copy()
            count_env["PGPASSWORD"] = params["password"]
            count_res = subprocess.run(
                count_cmd, env=count_env, check=False, capture_output=True, text=True
            )
            if count_res.returncode == 0:
                n = count_res.stdout.strip() or "?"
                print(f"   OK — {n} usuarios con password_hash='pass1234'.")
            else:
                print("   OK (no se pudo verificar el conteo).")
        elif name == "fix_enum_liberado":
            check_cmd = [
                psql,
                "-h", params["host"],
                "-p", params["port"],
                "-U", params["user"],
                "-d", params["name"],
                "-tAc",
                "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'estado_bloqueo_temporal'::regtype ORDER BY enumsortorder;",
            ]
            check_env = os.environ.copy()
            check_env["PGPASSWORD"] = params["password"]
            check_res = subprocess.run(
                check_cmd, env=check_env, check=False, capture_output=True, text=True
            )
            if check_res.returncode == 0:
                values = check_res.stdout.strip()
                print(f"   OK — valores del ENUM: {values}")
            else:
                print("   OK")
        else:
            print("   OK")
        return True
    except subprocess.TimeoutExpired:
        print("   ERROR: psql tardó más de 60s")
        return False
    except FileNotFoundError:
        print("   ERROR: psql no encontrado al invocarlo")
        return False


def main() -> int:
    params = resolve_db_params()
    masked = "*" * len(params["password"]) if params["password"] else "(empty)"
    print(
        f"[{datetime.now().isoformat(timespec='seconds')}] "
        f"Conectando a postgresql://{params['user']}:{masked}"
        f"@{params['host']}:{params['port']}/{params['name']}"
    )
    if shutil.which("psql") is None and find_psql() is None:
        print(
            "\n⚠️  psql no está disponible. Agregá la ruta de PostgreSQL a tu PATH o:\n"
            "   - Windows: C:\\Program Files\\PostgreSQL\\18\\bin\n"
            "   - Linux:   apt-get install postgresql-client\n"
            "   - macOS:   brew install libpq && export PATH=\"/opt/homebrew/opt/libpq/bin:$PATH\"\n"
        )
        print("\nSQL a ejecutar manualmente (en orden):\n")
        for name, ddl, desc, _ in STATEMENTS:
            print(f"-- {desc} ({name}) --")
            print(ddl)
        return 1

    failed = []
    for name, ddl, desc, autocommit in STATEMENTS:
        if not run_one(name, ddl, desc, params, autocommit=autocommit):
            failed.append(name)

    if failed:
        print(
            f"\n⚠️  Fallaron: {', '.join(failed)}. "
            "Revisá la conexión o los permisos del usuario de BD."
        )
        return 1

    print(
        f"\n[{datetime.now().isoformat(timespec='seconds')}] "
        "Migración aplicada con éxito."
    )
    print(
        "\nVerificá el resultado con:\n"
        f"  psql -h {params['host']} -U {params['user']} -d {params['name']} "
        "-c \"SELECT email, password_hash FROM usuarios LIMIT 3;\""
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
