"""
Endpoints públicos de validación de boletos (Estrategia 2 - QR real).

- `GET /v1/boletos/validar/{codigo_qr}`: punto de contacto del QR
  impreso/digital. Valida un boleto en el counter/embarque y lo
  marca como usado.

- `GET /v1/boletos/historial` (protegido con JWT): devuelve el
  historial de viajes del usuario autenticado con los datos del
  viaje, asiento y empresa, listo para pintar la pantalla
  `HistoryPage` en el frontend.

FIX BUG-102: `validar_boleto` rechaza QRs cuya fecha de viaje está
fuera de la ventana válida (1 día antes a 1 día después).
FIX XBUG-006: `validar_boleto` usa `SELECT ... FOR UPDATE` para
prevenir que 2 escaneos simultáneos del mismo QR embarquen al pasajero
2 veces. La BD no tiene UNIQUE constraint sobre `usado=True`, pero
el row lock garantiza atomicidad.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user_id
from app.models import Asiento, Boleto, Viaje
from app.repositories.booking_repository import BookingRepository
from app.schemas.transaction_schema import (
    BoletoHistorialItem,
    ChoferResumen,
    HistorialBoletosResponse,
)

router = APIRouter()


# Ventana de validez del QR: -1 día antes / +1 día después de la salida.
QR_VALID_WINDOW_BEFORE = timedelta(days=1)
QR_VALID_WINDOW_AFTER = timedelta(days=1)


@router.get(
    "/validar/{codigo_qr}",
    summary="Validar y marcar como usado un boleto por su código QR",
    tags=["Boletos"],
)
async def validar_boleto(
    codigo_qr: str,
    db: Session = Depends(get_db),
) -> dict:
    """
    Valida un boleto en el counter/embarque escaneando su QR.

    Flujo:
    1. Busca el `Boleto` por `codigo_qr` con `SELECT ... FOR UPDATE`
       (FIX XBUG-006) para evitar doble embarque concurrente.
    2. Si no existe, retorna `404`.
    3. Si `estado != 'activo'`, retorna `400`.
    4. Si `usado == True`, retorna alerta sin modificar.
    5. Si la fecha del viaje está fuera de la ventana
       [-1d, +1d] (FIX BUG-102), retorna `400`.
    6. Si todo OK, marca `usado=True`, `fecha_validacion=now()`,
       hace commit y retorna el mensaje de bienvenida con el
       `id_asiento` para asignación en el bus.
    """
    stmt = (
        select(Boleto)
        .where(Boleto.codigo_qr == codigo_qr)
        .with_for_update()
    )
    boleto = db.scalars(stmt).first()

    if boleto is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Boleto no encontrado para el código QR proporcionado",
        )

    if boleto.estado != "activo":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"El boleto no está activo (estado actual: {boleto.estado})"
            ),
        )

    if boleto.usado:
        return {
            "valido": False,
            "mensaje": "⚠️ ALERTA: Boleto ya utilizado previamente.",
            "codigo_qr": boleto.codigo_qr,
            "fecha_validacion": (
                boleto.fecha_validacion.isoformat()
                if boleto.fecha_validacion
                else None
            ),
        }

    viaje: Viaje | None = boleto.viaje
    if viaje is not None and viaje.fecha_hora_salida is not None:
        ahora = datetime.now()
        limite_inf = viaje.fecha_hora_salida - QR_VALID_WINDOW_BEFORE
        limite_sup = viaje.fecha_hora_salida + QR_VALID_WINDOW_AFTER
        if ahora < limite_inf or ahora > limite_sup:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"El boleto no puede validarse fuera de la ventana "
                    f"del viaje (salida: {viaje.fecha_hora_salida.isoformat()})."
                ),
            )

    boleto.usado = True
    boleto.fecha_validacion = datetime.now()
    db.commit()
    db.refresh(boleto)

    return {
        "valido": True,
        "mensaje": "✅ BIENVENIDO: Pasaje válido. Puede abordar el bus.",
        "asiento": boleto.id_asiento,
        "codigo_qr": boleto.codigo_qr,
        "fecha_validacion": boleto.fecha_validacion.isoformat(),
    }


@router.get(
    "/historial",
    response_model=HistorialBoletosResponse,
    summary="Historial de viajes del usuario autenticado (RF-21)",
    tags=["Boletos"],
)
async def get_historial_boletos(
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
) -> HistorialBoletosResponse:
    """
    Devuelve todos los boletos del usuario autenticado, enriquecidos
    con los datos del viaje (origen, destino, horarios, rampa, agencia)
    y del asiento (número, piso, tipo de servicio).

    Cada item incluye un campo derivado `status` que vale
    `'Pendiente'` si la salida es futura y `'Completado'` si el
    viaje ya pasó, listo para pintar el badge en `HistoryPage.jsx`.
    """
    repo = BookingRepository(db)
    boletos = repo.get_boletos_by_usuario(current_user_id)

    now = datetime.now()
    items: list[BoletoHistorialItem] = []
    for b in boletos:
        viaje: Viaje = b.viaje
        ruta = viaje.ruta if viaje else None
        bus = viaje.bus if viaje else None
        agencia = bus.agencia if bus else None
        chofer = viaje.chofer if viaje else None
        asiento: Asiento | None = b.asiento

        if b.estado == "cancelado":
            status_label = "Cancelado"
        elif viaje and viaje.estado == "cancelado":
            status_label = "Viaje cancelado"
        else:
            status_label = (
                "Completado"
                if viaje and viaje.fecha_hora_salida <= now
                else "Pendiente"
            )

        items.append(
            BoletoHistorialItem(
                id_boleto=b.id_boleto,
                codigo_qr=b.codigo_qr,
                estado=b.estado,
                usado=b.usado,
                precio_final=b.precio_final,
                fecha_emision=b.fecha_emision,
                id_viaje=viaje.id_viaje,
                fecha_hora_salida=viaje.fecha_hora_salida,
                fecha_hora_llegada=viaje.fecha_hora_llegada,
                estado_viaje=viaje.estado,
                rampa_embarque=viaje.rampa_embarque,
                origen=ruta.terminal_origen.nombre if ruta and ruta.terminal_origen else "",
                destino=ruta.terminal_destino.nombre if ruta and ruta.terminal_destino else "",
                empresa=agencia.razon_social if agencia else "",
                placa_bus=bus.placa if bus else None,
                chofer=(
                    ChoferResumen(
                        id_chofer=chofer.id_chofer,
                        nombres=chofer.nombres,
                        apellido_paterno=chofer.apellido_paterno,
                        apellido_materno=chofer.apellido_materno,
                        numero_documento=chofer.numero_documento,
                    )
                    if chofer
                    else None
                ),
                numero_asiento=asiento.numero_asiento if asiento else "",
                piso=asiento.piso if asiento else 1,
                tipo_servicio=asiento.tipo_servicio if asiento else "normal",
                status=status_label,
            )
        )

    return HistorialBoletosResponse(total=len(items), items=items)
