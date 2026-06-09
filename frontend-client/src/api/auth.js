import axiosInstance from './axiosInstance'

function extractToken(payload) {
  if (!payload) return null
  return payload.access_token ?? payload.accessToken ?? payload.token ?? null
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
  return {
    id: pick('id_usuario', 'idUsuario', 'id'),
    email: pick('email', 'correo'),
    phone: pick('telefono', 'phone'),
    rol,
    idAgencia: idAgencia === '' ? null : Number(idAgencia) || null,
    activo: rawUser.activo !== false,
    fechaCreacion: pick('fecha_creacion', 'fechaCreacion'),
    accountType,
    nombres: pick('nombres', 'names', 'name'),
    apellido_paterno: pick('apellido_paterno', 'apellidoPaterno', 'paternal_surname'),
    apellido_materno: pick('apellido_materno', 'apellidoMaterno', 'maternal_surname'),
    tipo_documento: pick('tipo_documento', 'tipoDocumento', 'doc_type') || 'DNI',
    numero_documento: pick('numero_documento', 'numeroDocumento', 'doc_number'),
    telefono: pick('telefono', 'phone'),
    raw: rawUser,
  }
}

export async function loginRequest({ email, password }) {
  const payload = {
    email: String(email || '').trim(),
    password: String(password || ''),
  }
  const { data } = await axiosInstance.post('/auth/login', payload)
  return {
    token: extractToken(data),
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
  const payload = {
    nombres: String(nombres || '').trim(),
    apellido_paterno: String(apellido_paterno || '').trim(),
    apellido_materno: String(apellido_materno || '').trim(),
    tipo_documento: String(tipo_documento || '').trim(),
    numero_documento: String(numero_documento || '').trim(),
    email: String(email || '').trim(),
    contrasena: String(contrasena || ''),
  }
  const tel = String(telefono || '').trim()
  if (tel) payload.telefono = tel
  const { data } = await axiosInstance.post('/auth/register', payload)
  return {
    token: extractToken(data),
    user: normalizeUser(extractUser(data)),
    raw: data,
  }
}

export async function fetchMeRequest() {
  const { data } = await axiosInstance.get('/auth/me')
  return normalizeUser(data?.usuario ?? data?.user ?? data)
}
