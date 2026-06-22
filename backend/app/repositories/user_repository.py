"""
Repositorio de Usuarios: capa de abstracción para acceder a la tabla
`usuarios` mediante la sesión de SQLAlchemy.

Esta capa NO contiene lógica de negocio (no hashea, no emite tokens).
Su responsabilidad es CRUD puro y queries filtradas.
"""

from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import normalize_email
from app.models import Usuario


class UserRepository:
    """Acceso a datos para `Usuario` (RF-01, RF-02)."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_id(self, user_id: int) -> Optional[Usuario]:
        """Busca un usuario por su PK."""
        return (
            self.db.query(Usuario)
            .filter(Usuario.id_usuario == user_id)
            .first()
        )

    def get_by_email(self, email: str) -> Optional[Usuario]:
        """
        Busca un usuario por su correo electrónico (índice único).

        FIX BUG-002/020: comparación case-insensitive via `func.lower()`
        para alinear con el índice único `uq_usuarios_email_lower`.
        El caller debe pasar el email ya normalizado con `normalize_email`.
        """
        normalized = normalize_email(email)
        if not normalized:
            return None
        return (
            self.db.query(Usuario)
            .filter(func.lower(Usuario.email) == normalized)
            .first()
        )

    def create(self, user: Usuario) -> Usuario:
        """Persiste un nuevo usuario y refresca sus campos por defecto."""
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def add(self, user: Usuario) -> None:
        """
        Encola un `Usuario` en la `UnitOfWork` actual sin confirmar.

        Pensado para transacciones atómicas multi-INSERT controladas
        por la capa de servicio. El `id_usuario` autoincremental se
        materializa con un `db.flush()` posterior.
        """
        self.db.add(user)

    def update(self, user: Usuario) -> Usuario:
        """Confirma cambios sobre un usuario ya trackeado."""
        self.db.commit()
        self.db.refresh(user)
        return user

    def delete(self, user: Usuario) -> None:
        """Elimina físicamente al usuario (uso administrativo)."""
        self.db.delete(user)
        self.db.commit()
