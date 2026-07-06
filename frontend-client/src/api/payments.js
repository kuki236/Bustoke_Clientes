import axiosInstance from './axiosInstance'

function unwrapError(err) {
  if (err && typeof err === 'object' && 'message' in err) {
    return err
  }
  return new Error('Error inesperado al comunicarse con el servidor.')
}

/**
 * POST /v1/payments/create
 * Crea un `Payment` en Mercado Pago con el token que emitió el
 * Card Payment Brick. NO se envían datos sensibles de la tarjeta
 * al backend: el Brick ya los tokenizó en su iframe.
 *
 * Devuelve { payment, approved, message }.
 * - `approved=true`  → llamar a /v1/bookings/process con `mp_payment_id`.
 * - `approved=false` → mostrar `message` al usuario.
 */
export async function createCardPayment(cardFormData) {
  const cf = cardFormData || {}

  // FIX: el Brick puede enviar los campos en camelCase o snake_case
  // según la versión. Aceptamos ambos para ser defensivos.
  const token = cf.token
  const paymentMethodId =
    cf.paymentMethodId || cf.payment_method_id || cf.paymentMethod || cf.payment_method
  const issuerId = cf.issuerId || cf.issuer_id
  const installments = cf.installments ?? 1
  const transactionAmount =
    cf.transactionAmount ?? cf.transaction_amount ?? cf.amount
  const externalReference =
    cf.externalReference || cf.external_reference || cf.external_ref
  const payer = cf.payer || {}
  const cardholderName = cf.cardholderName || cf.cardholder_name

  const payload = {
    token,
    payment_method_id: paymentMethodId,
    issuer_id: issuerId || undefined,
    installments: Number(installments) || 1,
    transaction_amount: Number(transactionAmount),
    external_reference: externalReference || 'BOOKING:NA:NA:1',
    payer: {
      email: payer?.email,
      first_name: cardholderName || payer?.first_name || undefined,
      identification_type: payer?.identification?.type || undefined,
      identification_number: payer?.identification?.number || undefined,
    },
  }

  try {
    const { data } = await axiosInstance.post('/payments/create', payload)
    return {
      payment: {
        id: data?.payment?.id,
        status: data?.payment?.status,
        statusDetail: data?.payment?.status_detail,
        paymentMethodId: data?.payment?.payment_method_id,
        externalReference: data?.payment?.external_reference,
      },
      approved: Boolean(data?.approved),
      message: data?.message || '',
    }
  } catch (err) {
    throw unwrapError(err)
  }
}
