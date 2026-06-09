"""
Repositorio de Pasajeros: capa de abstracción para la tabla `pasajeros`.

Operaciones CRUD puras (sin lógica de negocio). El método `add`
realiza sólo `db.add()` (sin commit) para integrarse en una
transacción atómica controlada por la capa de servicio.
"""

from typing import Optional

from sqlalchemy.orm import Session

from app.models import Pasajero, TipoDocumento


class PasajeroRepository:
    """Acceso a datos para `Pasajero` (RF-05)."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_id(self, pasajero_id: int) -> Optional[Pasajero]:
        return (
            self.db.query(Pasajero)
            .filter(Pasajero.id_pasajero == pasajero_id)
            .first()
        )

    def get_by_documento(self, numero_documento: str) -> Optional[Pasajero]:
        return (
            self.db.query(Pasajero)
            .filter(Pasajero.numero_documento == numero_documento)
            .first()
        )

    def get_by_user(self, user_id: int) -> Optional[Pasajero]:
        return (
            self.db.query(Pasajero)
            .filter(Pasajero.id_usuario == user_id)
            .first()
        )

    def resolve_tipo_documento_id(self, nombre: str) -> int:
        """
        Resuelve `id_tipo_documento` a partir de la etiqueta legible
        que envía el frontend (p.ej. 'DNI', 'Pasaporte', 'CE').

        Si el nombre no existe en el catálogo se lanza `ValueError`
        para que la capa superior lo traduzca a `400`/`422`.
        """
        row = (
            self.db.query(TipoDocumento)
            .filter(TipoDocumento.nombre == nombre)
            .first()
        )
        if row is None:
            raise ValueError(
                f"tipo_documento '{nombre}' no existe en el catálogo"
            )
        return row.id_tipo_documento

    def add(self, pasajero: Pasajero) -> None:
        """
        Encola un `Pasajero` en la `UnitOfWork` actual.

        NO ejecuta `commit`. Lo realiza la capa de servicio al
        confirmar la transacción atómica.
        """
        self.db.add(pasajero)
