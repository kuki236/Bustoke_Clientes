import axiosInstance from './axiosInstance'

function unwrapError(err) {
  if (err && typeof err === 'object' && 'message' in err) {
    return err
  }
  return new Error('Error inesperado al comunicarse con el servidor.')
}

/**
 * POST /v1/bookings/process
 * Procesa el checkout completo: valida bloqueos del token_sesion,
 * upserta pasajeros, emite boletos con QR y registra el pago.
 */
export async function processBookingRequest(payload) {
  try {
    const { data } = await axiosInstance.post('/bookings/process', payload)
    return {
      codigoReserva: data.codigo_reserva,
      idViaje: data.id_viaje,
      total: data.total,
      estado: data.estado,
      pago: {
        metodo: data.pago?.metodo,
        referenciaTransaccion: data.pago?.referencia_transaccion,
        montoTotal: data.pago?.monto_total,
        estado: data.pago?.estado,
      },
      boletos: (data.boletos || []).map((b) => ({
        idBoleto: b.id_boleto,
        idAsiento: b.id_asiento,
        numeroAsiento: b.numero_asiento,
        codigoQr: b.codigo_qr,
        precioFinal: b.precio_final,
        pasajero: b.pasajero,
      })),
    }
  } catch (err) {
    throw unwrapError(err)
  }
}
