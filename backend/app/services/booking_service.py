"""
Servicio de Bookings: orquesta el flujo transaccional de compra y
emisión de boletos (RF-07).
"""

import secrets
import uuid
from decimal import Decimal
from typing import List

from sqlalchemy.orm import Session

from app.repositories.booking_repository import BookingRepository


class BookingService:
    """Lógica de negocio del checkout integral (RF-07)."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = BookingRepository(db)

    def process_booking(self, payload) -> dict:
        """
        Procesa la compra completa dentro de un único `db.begin()`:

        1. Valida que el viaje exista.
        2. Verifica bloqueos vigentes para el `token_sesion`.
        3. Comprueba que los asientos pertenezcan al bus del viaje y
           que ninguno tenga un boleto activo.
        4. Upserta pasajeros (por `numero_documento`).
        5. Emite un boleto por pasajero con código QR único.
        6. Registra un pago por boleto en estado 'completado'.
        7. Marca los bloqueos como 'convertido' para liberar el pool.
        """
        with self.db.begin():
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
            referencia_transaccion = (
                f"{payload.metodo_pago.upper()}-TXT-"
                f"{secrets.token_hex(4).upper()}"
            )

            total = Decimal("0")
            boletos_emitidos: List[dict] = []

            for pax in payload.pasajeros:
                existing = self.repo.get_pasajero_by_doc(pax.numero_documento)
                if existing is not None:
                    pasajero = existing
                else:
                    pasajero = self.repo.create_pasajero(
                        {
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
                        "id_pasajero": pasajero.id_pasajero,
                        "id_asiento": pax.id_asiento,
                        "email_contacto": payload.comprador.email,
                        "canal": "app_bustoke",
                        "codigo_qr": codigo_qr,
                        "precio_final": precio,
                        "estado": "activo",
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

            self.repo.mark_holds_as_converted(holds)

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
