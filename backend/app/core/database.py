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
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


engine = create_engine(
    settings.database_url,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    pool_pre_ping=True,
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
