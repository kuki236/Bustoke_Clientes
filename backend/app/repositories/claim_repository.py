"""
Repositorio de Reclamos (RF-10, RF-19).

Encapsula el acceso a `reclamos` y `mensajes_reclamo`, incluyendo
los joins con la agencia y el usuario para la respuesta del API.
"""

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.agency import Agencia
from app.models.claim import MensajeReclamo, Reclamo
from app.models.user import Usuario


class ReclamoRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ------------------------------------------------------------------
    # CREACIÓN
    # ------------------------------------------------------------------
    def create(self, data: dict) -> Reclamo:
        """Persiste un nuevo reclamo en estado 'abierto'."""
        reclamo = Reclamo(**data)
        self.db.add(reclamo)
        self.db.commit()
        self.db.refresh(reclamo)
        return reclamo

    # ------------------------------------------------------------------
    # LECTURA
    # ------------------------------------------------------------------
    def get_by_id(self, id_reclamo: int) -> Optional[Reclamo]:
        stmt = (
            select(Reclamo)
            .options(
                joinedload(Reclamo.agencia),
                joinedload(Reclamo.mensajes).joinedload(MensajeReclamo.usuario),
            )
            .where(Reclamo.id_reclamo == id_reclamo)
        )
        return self.db.scalars(stmt).first()

    def list_by_usuario(self, id_usuario: int) -> List[Reclamo]:
        """Lista los reclamos del pasajero, los más recientes primero."""
        stmt = (
            select(Reclamo)
            .options(joinedload(Reclamo.agencia))
            .where(Reclamo.id_usuario == id_usuario)
            .order_by(Reclamo.fecha_creacion.desc())
        )
        return list(self.db.scalars(stmt).unique().all())

    # ------------------------------------------------------------------
    # MENSAJES (hilo conversacional)
    # ------------------------------------------------------------------
    def add_mensaje(
        self, id_reclamo: int, id_usuario: int, text_mensaje: str
    ) -> MensajeReclamo:
        """Agrega un mensaje al hilo y devuelve la fila persistida."""
        msg = MensajeReclamo(
            id_reclamo=id_reclamo,
            id_usuario=id_usuario,
            text_mensaje=text_mensaje,
        )
        self.db.add(msg)
        self.db.commit()
        self.db.refresh(msg)
        return msg

    # ------------------------------------------------------------------
    # RESPUESTA / CAMBIO DE ESTADO (RF-19)
    # ------------------------------------------------------------------
    def update_estado(
        self,
        reclamo: Reclamo,
        nuevo_estado: str,
        respuesta_admin: Optional[str] = None,
        id_usuario_admin: Optional[int] = None,
    ) -> Reclamo:
        """Cambia el estado del reclamo y, opcionalmente, agrega un
        mensaje al hilo en nombre del admin de la agencia."""
        reclamo.estado = nuevo_estado
        if respuesta_admin and id_usuario_admin:
            self.add_mensaje(
                id_reclamo=reclamo.id_reclamo,
                id_usuario=id_usuario_admin,
                text_mensaje=respuesta_admin,
            )
        self.db.commit()
        self.db.refresh(reclamo)
        return reclamo
