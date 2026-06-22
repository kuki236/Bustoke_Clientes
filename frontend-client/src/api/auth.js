import axiosInstance from './axiosInstance'

function extractAccessToken(payload) {
  if (!payload) return null
  return payload.access_token ?? payload.accessToken ?? payload.token ?? null
}

function extractRefreshToken(payload) {
  if (!payload) return null
  return payload.refresh_token ?? payload.refreshToken ?? null
}

function extractUser(payload) {
  if (!payload) return null
  if (payload.usuario) return payload.usuario
  if (payload.user) return payload.user
  if (payload.data?.user) return payload.data.user
  if (payload.id_usuario || payload.email) return payload
  return null
}

export function normalizeUser(rawUser) {
  if (!rawUser) return null
  const pick = (...keys) => {
    for (const key of keys) {
      if (rawUser[key] !== undefined && rawUser[key] !== null && rawUser[key] !== '') {
        return rawUser[key]
      }
    }
    return ''
  }
  const rol = pick('rol', 'role') || 'cliente'
  const idAgencia = pick('id_agencia', 'idAgencia')
  const accountType =
    rol === 'admin_agencia'
      ? 'Administrador de agencia'
      : rol === 'superadmin'
        ? 'Superadministrador'
        : 'Pasajero B2C'

  const nombres = pick('nombres', 'names', 'name', 'given_name')
  const apellidoPaterno = pick(
    'apellido_paterno',
    'apellidoPaterno',
    'paternal_surname',
    'last_name',
  )
  const apellidoMaterno = pick(
    'apellido_materno',
    'apellidoMaterno',
    'maternal_surname',
  )
  const tipoDocumento = pick('tipo_documento', 'tipoDocumento', 'doc_type') || 'DNI'
  const numeroDocumento = pick(
    'numero_documento',
    'numeroDocumento',
    'doc_number',
  )
  const telefono = pick('telefono', 'phone')
  const email = pick('email', 'correo')
  const idUsuario = pick('id_usuario', 'idUsuario', 'id')

  return {
    id: idUsuario,
    id_usuario: idUsuario,
    email,
    phone: telefono,
    rol,
    idAgencia: idAgencia === '' ? null : Number(idAgencia) || null,
    activo: rawUser.activo !== false,
    fechaCreacion: pick('fecha_creacion', 'fechaCreacion'),
    accountType,
    nombres,
    names: nombres,
    apellido_paterno: apellidoPaterno,
    apellidoPaterno: apellidoPaterno,
    paternalSurname: apellidoPaterno,
    apellido_materno: apellidoMaterno,
    apellidoMaterno: apellidoMaterno,
    maternalSurname: apellidoMaterno,
    tipo_documento: tipoDocumento,
    tipoDocumento: tipoDocumento,
    docType: tipoDocumento,
    numero_documento: numeroDocumento,
    numeroDocumento: numeroDocumento,
    docNumber: numeroDocumento,
    telefono,
    raw: rawUser,
  }
}

export async function loginRequest({ email, password }) {
  // FIX BUG-002/020: normalizar email a minúsculas antes de enviar.
  // Combinado con el índice único lower(email) del backend, el
  // login es ahora case-insensitive.
  const payload = {
    email: String(email || '').trim().toLowerCase(),
    password: String(password || ''),
  }
  const { data } = await axiosInstance.post('/auth/login', payload)
  return {
    accessToken: extractAccessToken(data),
    refreshToken: extractRefreshToken(data),
    user: normalizeUser(extractUser(data)),
    raw: data,
  }
}

export async function registerRequest({
  nombres,
  apellido_paterno,
  apellido_materno,
  tipo_documento,
  numero_documento,
  email,
  contrasena,
  telefono,
}) {
  // FIX BUG-002/020: lowercase en email para evitar duplicados por case.
  const payload = {
    nombres: String(nombres || '').trim(),
    apellido_paterno: String(apellido_paterno || '').trim(),
    apellido_materno: String(apellido_materno || '').trim(),
    tipo_documento: String(tipo_documento || '').trim(),
    numero_documento: String(numero_documento || '').trim(),
    email: String(email || '').trim().toLowerCase(),
    contrasena: String(contrasena || ''),
  }
  const tel = String(telefono || '').trim()
  if (tel) payload.telefono = tel
  const { data } = await axiosInstance.post('/auth/register', payload)
  return {
    accessToken: extractAccessToken(data),
    refreshToken: extractRefreshToken(data),
    user: normalizeUser(extractUser(data)),
    raw: data,
  }
}

export async function fetchMeRequest() {
  const { data } = await axiosInstance.get('/auth/me')
  return normalizeUser(data?.usuario ?? data?.user ?? data)
}
