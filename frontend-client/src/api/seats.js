import axiosInstance from './axiosInstance'

export const SEAT_STATUS = {
  FREE: 'libre',
  OCCUPIED: 'ocupado',
  HELD: 'bloqueado',
}

export class ApiError extends Error {
  constructor(message, { status, original } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.original = original
  }
}

function unwrapError(err) {
  if (err && typeof err === 'object' && 'message' in err) {
    return new ApiError(err.message, {
      status: err.status,
      original: err.original || err,
    })
  }
  return new ApiError('Error inesperado al comunicarse con el servidor.', {
    original: err,
  })
}

/**
 * GET /v1/travels/{id_viaje}/seats
 * Devuelve el mapa completo de asientos del bus asignado al viaje con
 * su estado (`libre` | `ocupado` | `bloqueado`) y precio por asiento.
 */
export async function fetchSeatMapRequest(idViaje) {
  try {
    const { data } = await axiosInstance.get(
      `/travels/${encodeURIComponent(idViaje)}/seats`,
    )
    return {
      idViaje: data.id_viaje ?? idViaje,
      idBus: data.id_bus ?? null,
      cantidadPisos: data.cantidad_pisos ?? 1,
      asientos: Array.isArray(data.asientos) ? data.asientos : [],
    }
  } catch (err) {
    throw unwrapError(err)
  }
}

/**
 * POST /v1/seats/hold
 * Crea (o renueva) un bloqueo temporal sobre el par (id_viaje, id_asiento).
 */
export async function holdSeatRequest({
  idViaje,
  idAsiento,
  tokenSesion = null,
  segundosTtl = null,
}) {
  try {
    const body = {
      id_viaje: idViaje,
      id_asiento: idAsiento,
    }
    if (tokenSesion) body.token_sesion = tokenSesion
    if (segundosTtl) body.segundos_ttl = segundosTtl

    const { data } = await axiosInstance.post('/seats/hold', body)
    return {
      idViaje: data.id_viaje,
      idAsiento: data.id_asiento,
      idBloqueo: data.id_bloqueo,
      expiraAt: data.expira_at,
      estado: data.estado,
    }
  } catch (err) {
    throw unwrapError(err)
  }
}

/**
 * POST /v1/seats/release
 * Libera un bloqueo temporal del par (id_viaje, id_asiento).
 *
 * Tolerante: si el backend responde 404 o 5xx (sesión expirada, sin
 * bloqueo, error transitorio) se devuelve un resultado neutro
 * (`estado='sin_bloqueo'`) en lugar de lanzar, para que la
 * des-selección en la UI nunca quede a medio camino.
 */
export async function releaseSeatRequest({
  idViaje,
  idAsiento,
  tokenSesion = null,
  idUsuario = null,
}) {
  try {
    const body = {
      id_viaje: idViaje,
      id_asiento: idAsiento,
    }
    if (tokenSesion) body.token_sesion = tokenSesion
    if (idUsuario) body.id_usuario = idUsuario

    const { data } = await axiosInstance.post('/seats/release', body)
    return {
      idViaje: data.id_viaje ?? idViaje,
      idAsiento: data.id_asiento ?? idAsiento,
      idBloqueo: data.id_bloqueo ?? null,
      expiraAt: data.expira_at ?? null,
      estado: data.estado || 'liberado',
    }
  } catch (err) {
    const status = err?.response?.status || err?.status
    if (status === 404 || (status >= 500 && status < 600)) {
      console.warn('[seats] release tolerante -> sin_bloqueo', {
        idViaje,
        idAsiento,
        status,
      })
      return {
        idViaje,
        idAsiento,
        idBloqueo: null,
        expiraAt: null,
        estado: 'sin_bloqueo',
      }
    }
    throw unwrapError(err)
  }
}
