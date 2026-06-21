import axiosInstance from './axiosInstance'

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function deriveMotivo(detalle) {
  if (!detalle) return 'Reclamo'
  const cleaned = String(detalle).trim()
  if (!cleaned) return 'Reclamo'
  const firstLine = cleaned.split(/\r?\n/, 1)[0]
  if (firstLine.length <= 150) return firstLine
  return `${firstLine.slice(0, 147).trim()}...`
}

export async function createClaimRequest({
  id_agencia,
  motivo,
  detalle,
  tipo_bien = 'producto',
}) {
  const payload = {
    id_agencia: toNumberOrNull(id_agencia),
    motivo: motivo || deriveMotivo(detalle),
    detalle: String(detalle || '').trim(),
    tipo_bien,
  }
  if (!payload.id_agencia) {
    throw new Error('Selecciona una empresa de transporte.')
  }
  if (!payload.detalle || payload.detalle.length < 15) {
    throw new Error('El detalle debe tener al menos 15 caracteres.')
  }
  const { data } = await axiosInstance.post('/claims/', payload)
  return data
}

export async function listMyClaimsRequest() {
  const { data } = await axiosInstance.get('/claims/me')
  return Array.isArray(data) ? data : []
}

export async function getClaimDetailRequest(idReclamo) {
  const { data } = await axiosInstance.get(`/claims/${idReclamo}`)
  return data
}

export async function addClaimMessageRequest(idReclamo, textMensaje) {
  const { data } = await axiosInstance.post(`/claims/${idReclamo}/messages`, {
    text_mensaje: String(textMensaje || '').trim(),
  })
  return data
}

export function normalizeClaim(raw) {
  if (!raw) return null
  return {
    id: raw.id_reclamo,
    idReclamo: raw.id_reclamo,
    idAgencia: raw.id_agencia,
    motivo: raw.motivo || '',
    detalle: raw.detalle || '',
    estado: raw.estado || 'abierto',
    fechaCreacion: raw.fecha_creacion,
    fechaCreacionIso: raw.fecha_creacion,
  }
}
