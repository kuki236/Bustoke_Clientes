"""
Endpoints de Reclamos (RF-10, RF-19, RF-08).

Implementa el flujo completo del Libro de Reclamaciones:

- `POST   /v1/claims/`              → alta de reclamo (pasajero autenticado)
- `GET    /v1/claims/me`            → listado de reclamos del pasajero
- `GET    /v1/claims/{id_reclamo}`  → detalle + hilo de mensajes
- `POST   /v1/claims/{id_reclamo}/messages` → añadir mensaje al hilo
- `POST   /v1/claims/{id_reclamo}/respond`  → respuesta admin de la agencia (RF-19)

Al crear un reclamo y al recibir respuesta del admin se envía un
email al pasajero (RF-08). Si `RESEND_API_KEY` no está configurada
los emails se omiten sin fallar el flujo.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user_id
from app.models.claim import Reclamo
from app.models.user import Usuario
from app.repositories.claim_repository import ReclamoRepository
from app.schemas.claim_schema import (
    MensajeReclamoCreate,
    MensajeReclamoRead,
    ReclamoCreate,
    ReclamoHiloRead,
    ReclamoRead,
    ReclamoRespuestaAdmin,
)
from app.services.email_service import get_email_service

router = APIRouter()


def _to_reclamo_read(r: Reclamo) -> ReclamoRead:
    return ReclamoRead(
        id_reclamo=r.id_reclamo,
        id_usuario=r.id_usuario,
        id_agencia=r.id_agencia,
        motivo=r.motivo,
        detalle=r.detalle,
        estado=r.estado,
        fecha_creacion=r.fecha_creacion,
    )


def _build_hilo(reclamo: Reclamo) -> ReclamoHiloRead:
    return ReclamoHiloRead(
        id_reclamo=reclamo.id_reclamo,
        id_usuario=reclamo.id_usuario,
        id_agencia=reclamo.id_agencia,
        motivo=reclamo.motivo,
        detalle=reclamo.detalle,
        estado=reclamo.estado,
        fecha_creacion=reclamo.fecha_creacion,
        mensajes=[
            MensajeReclamoRead(
                id_mensaje=m.id_mensaje,
                id_reclamo=m.id_reclamo,
                id_usuario=m.id_usuario,
                text_mensaje=m.text_mensaje,
                fecha=m.fecha,
            )
            for m in reclamo.mensajes
        ],
    )


def _user_email(db: Session, id_usuario: int) -> str:
    """Helper: devuelve el email del usuario (o '' si no existe)."""
    user = db.get(Usuario, id_usuario)
    return user.email if user else ""


@router.post(
    "/",
    response_model=ReclamoRead,
    status_code=status.HTTP_201_CREATED,
    summary="Abrir un reclamo (RF-10)",
)
def create_claim(
    payload: ReclamoCreate,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
) -> ReclamoRead:
    """
    Crea un reclamo en estado `abierto` para el pasajero autenticado
    y le envía un email de acuse (RF-08).
    """
    repo = ReclamoRepository(db)
    reclamo = repo.create(
        {
            "id_usuario": current_user_id,
            "id_agencia": payload.id_agencia,
            "motivo": payload.motivo,
            "detalle": payload.detalle,
        }
    )
    # Email de acuse (best-effort, no falla el flujo si Resend no está)
    email = _user_email(db, current_user_id)
    if email:
        get_email_service().send_claim_received(email, _to_reclamo_read(reclamo).model_dump())
    return _to_reclamo_read(reclamo)


@router.get(
    "/me",
    response_model=list[ReclamoRead],
    summary="Reclamos del usuario autenticado (RF-10)",
)
def list_my_claims(
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
) -> list[ReclamoRead]:
    """Lista los reclamos del pasajero, los más recientes primero."""
    repo = ReclamoRepository(db)
    reclamos = repo.list_by_usuario(current_user_id)
    return [_to_reclamo_read(r) for r in reclamos]


@router.get(
    "/{id_reclamo}",
    response_model=ReclamoHiloRead,
    summary="Detalle de un reclamo con su hilo (RF-10)",
)
def get_claim_detail(
    id_reclamo: int,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
) -> ReclamoHiloRead:
    """
    Devuelve el reclamo + todos sus mensajes. Sólo accesible al dueño
    del reclamo.
    """
    repo = ReclamoRepository(db)
    reclamo = repo.get_by_id(id_reclamo)
    if reclamo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reclamo no encontrado",
        )
    if reclamo.id_usuario != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a este reclamo",
        )
    return _build_hilo(reclamo)


@router.post(
    "/{id_reclamo}/messages",
    response_model=MensajeReclamoRead,
    status_code=status.HTTP_201_CREATED,
    summary="Añadir mensaje al hilo del reclamo",
)
def add_message(
    id_reclamo: int,
    payload: MensajeReclamoCreate,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
) -> MensajeReclamoRead:
    """El pasajero agrega un mensaje al hilo de su propio reclamo."""
    repo = ReclamoRepository(db)
    reclamo = repo.get_by_id(id_reclamo)
    if reclamo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reclamo no encontrado",
        )
    if reclamo.id_usuario != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a este reclamo",
        )
    msg = repo.add_mensaje(
        id_reclamo=id_reclamo,
        id_usuario=current_user_id,
        text_mensaje=payload.text_mensaje,
    )
    return MensajeReclamoRead(
        id_mensaje=msg.id_mensaje,
        id_reclamo=msg.id_reclamo,
        id_usuario=msg.id_usuario,
        text_mensaje=msg.text_mensaje,
        fecha=msg.fecha,
    )


@router.post(
    "/{id_reclamo}/respond",
    response_model=ReclamoHiloRead,
    summary="Respuesta admin de la agencia (RF-19)",
)
def respond_claim(
    id_reclamo: int,
    payload: ReclamoRespuestaAdmin,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
) -> ReclamoHiloRead:
    """
    Admin de la agencia (o superadmin) responde y/o cierra un reclamo.
    Cambia el estado, registra la respuesta como mensaje en el hilo
    y notifica al pasajero por email (RF-08).
    """
    repo = ReclamoRepository(db)
    reclamo = repo.get_by_id(id_reclamo)
    if reclamo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reclamo no encontrado",
        )
    repo.update_estado(
        reclamo=reclamo,
        nuevo_estado=payload.estado,
        respuesta_admin=payload.respuesta,
        id_usuario_admin=current_user_id,
    )
    # Releer con el nuevo estado y mensaje
    reclamo = repo.get_by_id(id_reclamo)
    # Notificar al pasajero (best-effort)
    email = _user_email(db, reclamo.id_usuario)
    if email:
        get_email_service().send_claim_responded(
            email,
            _to_reclamo_read(reclamo).model_dump(),
            respuesta=payload.respuesta,
            estado=payload.estado,
        )
    return _build_hilo(reclamo)
