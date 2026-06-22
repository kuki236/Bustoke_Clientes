import axiosInstance from './axiosInstance'

function pad(value) {
  return String(value).padStart(2, '0')
}

function parseDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatTimeToAmPm(value) {
  const d = parseDate(value)
  if (!d) return ''
  let h = d.getHours()
  const m = pad(d.getMinutes())
  const suffix = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${pad(h)}:${m} ${suffix}`
}

function formatDateToDDMMYYYY(value) {
  const d = parseDate(value)
  if (!d) return ''
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function inferCompanyFromRazonSocial(razonSocial) {
  const r = String(razonSocial ?? '').toUpperCase()
  if (r.includes('CRUZ DEL SUR')) return 'Cruz del Sur'
  if (r.includes('OLTURSA')) return 'Oltursa'
  if (r.includes('CIVA')) return 'Civa'
  if (r.includes('MOVIL BUS') || r.includes('MOVILBUS')) return 'Movil Bus'
  return razonSocial || 'Empresa'
}

export function formatServiceType(tipo) {
  const t = String(tipo ?? '').toLowerCase()
  if (t === 'vip') return 'VIP'
  return 'Normal'
}

function normalizeChofer(rawChofer) {
  if (!rawChofer) return null
  const nombres = String(rawChofer.nombres || '').trim()
  const paterno = String(rawChofer.apellido_paterno || '').trim()
  const materno = String(rawChofer.apellido_materno || '').trim()
  return {
    id: rawChofer.id_chofer,
    nombres,
    apellidoPaterno: paterno,
    apellidoMaterno: materno,
    numeroDocumento: rawChofer.numero_documento || '',
    nombreCompleto: [nombres, paterno, materno].filter(Boolean).join(' '),
  }
}

export function normalizeHistorialItem(raw) {
  if (!raw) return null
  const fechaSalida = raw.fecha_hora_salida ?? raw.fechaHoraSalida
  const fechaLlegada = raw.fecha_hora_llegada ?? raw.fechaHoraLlegada
  // FIX BUG-124: el backend ahora devuelve status más rico
  // ("Pendiente" | "Completado" | "Cancelado" | "Viaje cancelado").
  // Mapeamos a keys en minúsculas para el frontend pero conservamos
  // el string original para mostrarlo en el badge.
  const statusBackend = String(raw.status ?? '').toLowerCase()
  let statusKey = 'completado'
  if (statusBackend === 'pendiente') statusKey = 'pendiente'
  else if (statusBackend.includes('cancelado')) statusKey = 'cancelado'
  const chofer = normalizeChofer(raw.chofer)

  return {
    id: String(raw.id_boleto ?? raw.id ?? ''),
    idBoleto: raw.id_boleto,
    idViaje: raw.id_viaje,
    company: inferCompanyFromRazonSocial(raw.empresa),
    origin: raw.origen || '',
    destination: raw.destino || '',
    departureTime: formatTimeToAmPm(fechaSalida),
    arrivalTime: formatTimeToAmPm(fechaLlegada),
    departureIso: fechaSalida || '',
    arrivalIso: fechaLlegada || '',
    date: formatDateToDDMMYYYY(fechaSalida),
    price: Number(raw.precio_final ?? 0),
    service: formatServiceType(raw.tipo_servicio),
    seat: raw.numero_asiento || '',
    status: statusKey,
    statusLabel: raw.status || statusKey,
    reservationCode: raw.codigo_qr || '',
    placaBus: raw.placa_bus || '',
    rampaEmbarque: raw.rampa_embarque || '',
    estadoViaje: raw.estado_viaje || '',
    chofer,
    choferNombre: chofer?.nombreCompleto || '',
    raw,
  }
}

export async function fetchHistorialRequest() {
  const { data } = await axiosInstance.get('/boletos/historial')
  const items = Array.isArray(data?.items) ? data.items : []
  return items.map(normalizeHistorialItem).filter(Boolean)
}
