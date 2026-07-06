"""
Servicio de Bookings: orquesta el flujo transaccional de compra y
emisión de boletos (RF-07, RF-08).
"""

import logging
import secrets
import uuid
from decimal import Decimal
from typing import List, Optional

from sqlalchemy.orm import Session

from app.repositories.booking_repository import BookingRepository
from app.services.email_service import EmailService

logger = logging.getLogger(__name__)


class BookingService:
    """Lógica de negocio del checkout integral (RF-07)."""

    def __init__(self, db: Session, email_service: Optional[EmailService] = None) -> None:
        self.db = db
        self.repo = BookingRepository(db)
        self.email_service = email_service or EmailService()

    def process_booking(self, payload, id_usuario: Optional[int]) -> dict:
        """
        Procesa la compra completa dentro de un único `db.begin()`:

        1. Valida que el viaje exista.
        2. Verifica bloqueos vigentes para el `token_sesion`.
        3. Comprueba que los asientos pertenezcan al bus del viaje y
           que ninguno tenga un boleto activo.
        4. Upserta pasajeros (por `numero_documento`).
        5. Emite un boleto por pasajero con código QR único,
           vinculándolo al `id_usuario` autenticado (o NULL si es
           guest, RF-02).
        6. Registra un pago por boleto en estado 'completado'.
        7. Marca los bloqueos como 'convertido' para liberar el pool.
        8. Envía email de confirmación con el PDF del boleto (RF-08)
           a `email_contacto`. Si el email no está configurado, se
           omite sin fallar la compra.
        """
        with self.db.begin():
            # FIX BUG-111: rechazar checkout si el comprador no aceptó
            # los términos y políticas. Antes el server_default='true'
            # marcaba TODOS los boletos como aceptados sin importar
            # el checkbox del frontend.
            if not getattr(payload, "acepto_terminos_politicas", False):
                raise ValueError(
                    "Debes aceptar los términos y políticas para continuar."
                )

            viaje = self.repo.get_viaje(payload.id_viaje)
            if viaje is None:
                raise ValueError(f"Viaje {payload.id_viaje} no encontrado")

            id_bus = viaje.id_bus
            id_ruta = viaje.id_ruta

            id_asientos = [p.id_asiento for p in payload.pasajeros]
            unique_ids = list(dict.fromkeys(id_asientos))

            holds = self.repo.get_active_holds(
                payload.id_viaje, payload.token_sesion, unique_ids
            )
            if len(holds) != len(unique_ids):
                raise ValueError(
                    "Algunos asientos no tienen un bloqueo activo "
                    "para esta sesión"
                )

            asientos = self.repo.get_asientos_for_bus(id_bus, unique_ids)
            if len(asientos) != len(unique_ids):
                raise ValueError(
                    "Algunos asientos no pertenecen al bus del viaje"
                )
            asientos_map = {a.id_asiento: a for a in asientos}

            for id_asiento in unique_ids:
                if self.repo.has_active_ticket(payload.id_viaje, id_asiento):
                    raise ValueError(
                        f"El asiento {id_asiento} ya tiene un boleto activo"
                    )

            codigo_reserva = f"BK-{uuid.uuid4().hex[:10].upper()}"
            # FIX: si el frontend envió `mp_payment_id` (porque pasó por
            # el Card Payment Brick y MP aprobó el cargo), lo usamos
            # como referencia de la transacción en lugar del placeholder
            # TARJETA-TXT-XXXXXX. Así el pago queda reconciliable con
            # el panel de MP y con futuros webhooks/notificaciones.
            mp_payment_id = getattr(payload, "mp_payment_id", None)
            if payload.metodo_pago == "tarjeta" and mp_payment_id:
                referencia_transaccion = f"MP-{int(mp_payment_id)}"
            else:
                referencia_transaccion = (
                    f"{payload.metodo_pago.upper()}-TXT-"
                    f"{secrets.token_hex(4).upper()}"
                )
            email_payloads: list[dict] = []

            total = Decimal("0")
            boletos_emitidos: List[dict] = []
            # Atajos para el email de confirmación (RF-08): los joinedload
            # de get_viaje garantizan que estos atributos estén cargados.
            ruta = viaje.ruta if viaje else None
            bus = viaje.bus if viaje else None
            agencia = bus.agencia if bus else None
            chofer = getattr(viaje, "chofer", None) if viaje else None

            for pax in payload.pasajeros:
                existing = self.repo.get_pasajero_by_doc(pax.numero_documento)
                if existing is not None:
                    pasajero = existing
                else:
                    pasajero = self.repo.create_pasajero(
                        {
                            "id_usuario": id_usuario,
                            "id_tipo_documento": pax.id_tipo_documento,
                            "numero_documento": pax.numero_documento,
                            "nombres": pax.nombres,
                            "apellido_paterno": pax.apellido_paterno,
                            "apellido_materno": pax.apellido_materno,
                            "fecha_nacimiento": pax.fecha_nacimiento,
                        }
                    )

                asiento = asientos_map[pax.id_asiento]
                precio = self.repo.get_precio_for_seat(
                    id_ruta, asiento.tipo_servicio
                )
                total += precio

                codigo_qr = f"QR-{uuid.uuid4().hex[:12].upper()}"

                boleto = self.repo.create_boleto(
                    {
                        "id_viaje": payload.id_viaje,
                        "id_usuario": id_usuario,
                        "id_pasajero": pasajero.id_pasajero,
                        "id_asiento": pax.id_asiento,
                        "email_contacto": payload.comprador.email,
                        "canal": "app_bustoke",
                        "codigo_qr": codigo_qr,
                        "precio_final": precio,
                        "estado": "activo",
                        # FIX BUG-111: persistir el valor real del
                        # checkbox enviado por el frontend.
                        "acepto_terminos_politicas": bool(
                            getattr(payload, "acepto_terminos_politicas", False)
                        ),
                    }
                )
                self.repo.create_pago(
                    {
                        "id_boleto": boleto.id_boleto,
                        "metodo": payload.metodo_pago,
                        "monto_total": precio,
                        "referencia_transaccion": referencia_transaccion,
                        "estado": "completado",
                    }
                )

                nombre_completo = (
                    f"{pasajero.nombres} "
                    f"{pasajero.apellido_paterno} "
                    f"{pasajero.apellido_materno}"
                ).strip()
                boletos_emitidos.append(
                    {
                        "id_boleto": boleto.id_boleto,
                        "id_asiento": pax.id_asiento,
                        "numero_asiento": asiento.numero_asiento,
                        "codigo_qr": codigo_qr,
                        "precio_final": precio,
                        "pasajero": nombre_completo,
                    }
                )
                # Acumula los datos para enviar el email de confirmación
                # DESPUÉS de que la transacción confirme (RF-08).
                email_payloads.append(
                    {
                        "to_email": boleto.email_contacto,
                        "boleto": {
                            "id_boleto": boleto.id_boleto,
                            "codigo_qr": codigo_qr,
                            "precio_final": float(precio),
                            "nombres": pasajero.nombres,
                            "apellido_paterno": pasajero.apellido_paterno,
                            "apellido_materno": pasajero.apellido_materno,
                            "origen": (
                                ruta.terminal_origen.nombre
                                if ruta and ruta.terminal_origen
                                else ""
                            ),
                            "destino": (
                                ruta.terminal_destino.nombre
                                if ruta and ruta.terminal_destino
                                else ""
                            ),
                            "fecha_hora_salida": viaje.fecha_hora_salida,
                            "fecha_hora_llegada": viaje.fecha_hora_llegada,
                            "rampa_embarque": viaje.rampa_embarque,
                            "empresa": (
                                agencia.razon_social if agencia else ""
                            ),
                            "placa_bus": bus.placa if bus else None,
                            "numero_asiento": asiento.numero_asiento,
                            "tipo_servicio": asiento.tipo_servicio,
                            "chofer_nombre": (
                                chofer.nombre_completo if chofer else ""
                            ),
                        },
                    }
                )

            self.repo.mark_holds_as_converted(holds)

        # La transacción ya confirmó: enviar emails (no fallan la compra
        # si SMTP no está configurado o si la red está caída).
        for item in email_payloads:
            self.email_service.send_compra_confirmation(
                to_email=item["to_email"],
                boleto=item["boleto"],
                codigo_reserva=codigo_reserva,
            )

        return {
            "codigo_reserva": codigo_reserva,
            "id_viaje": payload.id_viaje,
            "total": total,
            "estado": "confirmada",
            "pago": {
                "metodo": payload.metodo_pago,
                "referencia_transaccion": referencia_transaccion,
                "monto_total": total,
                "estado": "completado",
            },
            "boletos": boletos_emitidos,
        }
