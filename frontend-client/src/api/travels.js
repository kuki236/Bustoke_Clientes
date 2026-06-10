import axiosInstance from './axiosInstance'
import { getTerminalById } from '../data/terminales'

function pad(value) {
  return String(value).padStart(2, '0')
}

export function formatTimeToAmPm(value) {
  if (!value) return ''
  if (typeof value === 'string') {
    const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
    if (match) {
      const hours = Number(match[1])
      const minutes = match[2]
      const suffix = hours >= 12 ? 'PM' : 'AM'
      const displayHours = hours % 12 === 0 ? 12 : hours % 12
      return `${pad(displayHours)}:${minutes} ${suffix}`
    }
    const isoMatch = value.match(/T(\d{2}):(\d{2})/)
    if (isoMatch) {
      return formatTimeToAmPm(`${isoMatch[1]}:${isoMatch[2]}`)
    }
    return value
  }
  if (value instanceof Date) {
    return formatTimeToAmPm(`${pad(value.getHours())}:${pad(value.getMinutes())}`)
  }
  return ''
}

export function formatDateToDDMMYYYY(value) {
  if (!value) return ''
  if (value instanceof Date) {
    return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()}`
  }
  const str = String(value)
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`
  }
  return str
}

export function toBackendDate(value) {
  if (!value) return ''
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }
  const str = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10)
  const dmy = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  return str
}

export function inferShift(hours) {
  if (typeof hours !== 'number' || Number.isNaN(hours)) return ''
  if (hours >= 5 && hours < 12) return 'Mañana'
  if (hours >= 12 && hours < 19) return 'Tarde'
  return 'Noche'
}

function pickHours(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return value
  const str = String(value)
  const match = str.match(/T(\d{2}):(\d{2})/) || str.match(/^(\d{1,2}):(\d{2})/)
  if (match) return Number(match[1])
  const date = new Date(str)
  return Number.isNaN(date.getTime()) ? null : date.getHours()
}

function inferCompanyFromAgencia(idAgencia) {
  switch (Number(idAgencia)) {
    case 1:
      return 'Cruz del Sur'
    case 2:
      return 'Oltursa'
    case 3:
      return 'Civa'
    case 4:
      return 'Movil Bus'
    default:
      return ''
  }
}

export function normalizeTravel(rawTravel, index = 0) {
  if (!rawTravel) return null
  const pick = (...keys) => {
    for (const key of keys) {
      if (rawTravel[key] !== undefined && rawTravel[key] !== null && rawTravel[key] !== '') {
        return rawTravel[key]
      }
    }
    return ''
  }
  const fechaSalida = pick('fecha_hora_salida', 'fechaHoraSalida', 'fecha_salida', 'fechaSalida')
  const fechaLlegada = pick('fecha_hora_llegada', 'fechaHoraLlegada', 'fecha_llegada', 'fechaLlegada')
  const departureHours = pickHours(fechaSalida)
  const services = Array.isArray(rawTravel.servicios)
    ? rawTravel.servicios
    : Array.isArray(rawTravel.services)
      ? rawTravel.services
      : pick('tipo_asiento', 'tipoAsiento', 'servicio')
        ? [pick('tipo_asiento', 'tipoAsiento', 'servicio')]
        : ['Normal']
  const normalizeSeatTypes = (value) => {
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (item === null || item === undefined) return ''
          if (typeof item === 'string') return item
          if (typeof item === 'object') {
            return item.tipo || item.type || item.nombre || item.name || ''
          }
          return String(item)
        })
        .map((s) => String(s).trim())
        .filter(Boolean)
    }
    if (typeof value === 'string') {
      return value
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean)
    }
    if (value && typeof value === 'object') {
      const single = value.tipo || value.type || value.nombre || value.name
      if (single) return [String(single).trim()].filter(Boolean)
    }
    return []
  }
  const rawSeatTypes =
    rawTravel.tipos_asiento ??
    rawTravel.seatTypes ??
    rawTravel.tipo_asiento ??
    rawTravel.tipoAsiento ??
    rawTravel.servicio ??
    rawTravel.servicios ??
    []
  const seatTypes = normalizeSeatTypes(rawSeatTypes)
  const idAgencia = pick('id_agencia', 'idAgencia')
  return {
    id:
      pick('id_viaje', 'idViaje', 'id') ||
      `trip-${index}-${fechaSalida || 'na'}`,
    idAgencia: Number(idAgencia) || null,
    company:
      pick('nombre_agencia', 'nombreAgencia', 'company', 'agencia') ||
      inferCompanyFromAgencia(idAgencia),
    origin: pick('terminal_origen', 'terminalOrigen', 'origen', 'origin'),
    destination: pick('terminal_destino', 'terminalDestino', 'destino', 'destination'),
    departureTime: formatTimeToAmPm(fechaSalida),
    arrivalTime: formatTimeToAmPm(fechaLlegada),
    departureIso: fechaSalida || '',
    arrivalIso: fechaLlegada || '',
    priceFrom: Number(pick('precio_base', 'precioBase', 'tarifa_base', 'price', 'priceFrom')) || 0,
    boardingPoint: pick(
      'rampa_embarque',
      'rampaEmbarque',
      'paradero',
      'terminal_embarque',
      'boardingPoint',
    ),
    seatsLeft:
      Number(
        pick('asientos_libres', 'asientosLibres', 'seatsLeft', 'asientos_disponibles'),
      ) || 0,
    services,
    seatTypes,
    tipos_asiento: seatTypes,
    shift: pick('turno', 'shift') || inferShift(departureHours),
    raw: rawTravel,
  }
}

export class TerminalNotResolvedError extends Error {
  constructor(field, value) {
    super(
      `No reconocemos el ${field} "${value}". Prueba con ciudades disponibles ` +
        `(Lima, Trujillo, Arequipa, Chiclayo, Cusco, Huancayo).`,
    )
    this.name = 'TerminalNotResolvedError'
    this.field = field
    this.value = value
    this.status = 400
  }
}

function ensurePositiveInt(value, field) {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) {
    const err = new Error(`El ${field} no es un identificador de terminal válido.`)
    err.status = 400
    throw err
  }
  return n
}

export async function searchTravelsRequest({
  id_terminal_origen,
  id_terminal_destino,
  fecha_salida,
  idAgencia = null,
  agencias = null,
  precio_min = null,
  precio_max = null,
  tipo_servicio = null,
  turno = null,
}) {
  const idTerminalOrigen = ensurePositiveInt(id_terminal_origen, 'id_terminal_origen')
  const idTerminalDestino = ensurePositiveInt(id_terminal_destino, 'id_terminal_destino')

  if (idTerminalOrigen === idTerminalDestino) {
    const err = new Error('El origen y el destino deben ser distintos.')
    err.status = 400
    throw err
  }

  const fechaSalida = toBackendDate(fecha_salida)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaSalida)) {
    const err = new Error('La fecha de salida no es válida.')
    err.status = 400
    throw err
  }

  const params = {
    id_terminal_origen: idTerminalOrigen,
    id_terminal_destino: idTerminalDestino,
    fecha_salida: fechaSalida,
  }

  // --- Filtros opcionales: solo se envían si tienen valor ---
  const agenciasNormalizadas = normalizeAgencias(agencias)
  if (agenciasNormalizadas.length > 0) {
    params.agencias = agenciasNormalizadas.join(',')
  } else if (idAgencia) {
    params.id_agencia = Number(idAgencia)
  }

  const precioMinNum = toFiniteNumber(precio_min)
  const precioMaxNum = toFiniteNumber(precio_max)
  if (precioMinNum !== null) params.precio_min = precioMinNum
  if (precioMaxNum !== null) params.precio_max = precioMaxNum

  if (typeof tipo_servicio === 'string') {
    const v = tipo_servicio.trim().toLowerCase()
    if (v === 'vip' || v === 'normal') params.tipo_servicio = v
  }
  if (typeof turno === 'string') {
    const v = turno.trim().toLowerCase()
    if (v === 'manana' || v === 'tarde' || v === 'noche') params.turno = v
  }

  const { data } = await axiosInstance.get('/travels/search', { params })
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.results)
      ? data.results
      : []

  const originLabel = getTerminalById(idTerminalOrigen)?.ciudad || ''
  const destinationLabel = getTerminalById(idTerminalDestino)?.ciudad || ''

  return list
    .map((item, index) => normalizeTravel(item, index))
    .filter(Boolean)
    .map((trip) => ({
      ...trip,
      origin: trip.origin || originLabel,
      destination: trip.destination || destinationLabel,
    }))
}

function normalizeAgencias(agencias) {
  if (agencias === null || agencias === undefined) return []
  const arr = Array.isArray(agencias)
    ? agencias
    : String(agencias)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
  const seen = new Set()
  const out = []
  for (const value of arr) {
    const n = Number(value)
    if (Number.isInteger(n) && n > 0 && !seen.has(n)) {
      seen.add(n)
      out.push(n)
    }
  }
  return out
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
