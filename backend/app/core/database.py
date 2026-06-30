"""
Sesión y engine de SQLAlchemy para PostgreSQL.

Este módulo expone:
- `engine`: instancia singleton del motor de base de datos.
- `SessionLocal`: fábrica de sesiones.
- `Base`: clase declarativa base para todos los modelos ORM.
- `get_db`: dependencia inyectable de FastAPI para manejar el ciclo de vida
  de la sesión por request.
"""

from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


def _build_connect_args() -> dict:
    """
    Construye los `connect_args` para psycopg2.

    Reglas:
    - Si el usuario define `DB_SSLMODE` (o lo incluye en DATABASE_URL), se respeta.
    - Si la URL apunta a un host con 'neon.tech' y no trae sslmode, forzamos
      `sslmode=require` porque Neon rechaza conexiones sin TLS.
    """
    url = make_url(settings.database_url)
    # Si sslmode ya viene en la query, no tocamos nada.
    if "sslmode" in (url.query or {}):
        return {}
    # Forzar SSL en hosts gestionados tipo Neon/Render/Supabase.
    host = (url.host or "").lower()
    needs_ssl = (
        settings.DB_SSLMODE is not None
        or "neon.tech" in host
        or "render.com" in host
        or "supabase.co" in host
    )
    if not needs_ssl:
        return {}
    sslmode = settings.DB_SSLMODE or "require"
    return {"sslmode": sslmode}


engine = create_engine(
    settings.database_url,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    pool_pre_ping=True,
    connect_args=_build_connect_args(),
    echo=settings.DB_ECHO_SQL,
    future=True,
)

SessionLocal: sessionmaker[Session] = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    class_=Session,
)


class Base(DeclarativeBase):
    """Clase base declarativa para todos los modelos ORM del proyecto."""

    pass


def get_db() -> Generator[Session, None, None]:
    """
    Dependencia de FastAPI que entrega una sesión por request.

    Garantiza el cierre de la sesión (incluso ante excepciones) y
    aplica rollback automático si la transacción falla.
    """
    db: Session = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
