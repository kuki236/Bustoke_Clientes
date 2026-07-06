import axios from 'axios'

const ACCESS_TOKEN_KEY = 'bustoke_access_token'
const REFRESH_TOKEN_KEY = 'bustoke_refresh_token'

export function getAccessToken() {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY)
  } catch {
    return null
  }
}

export function getRefreshToken() {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAccessToken(token) {
  try {
    if (token) {
      localStorage.setItem(ACCESS_TOKEN_KEY, token)
    } else {
      localStorage.removeItem(ACCESS_TOKEN_KEY)
    }
  } catch {
    // ignore storage errors (e.g. private mode)
  }
}

export function setRefreshToken(token) {
  try {
    if (token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, token)
    } else {
      localStorage.removeItem(REFRESH_TOKEN_KEY)
    }
  } catch {
    // ignore storage errors
  }
}

export function setTokens({ access, refresh } = {}) {
  setAccessToken(access)
  if (refresh !== undefined) setRefreshToken(refresh)
}

export function clearAccessToken() {
  setAccessToken(null)
}

export function clearAllTokens() {
  setAccessToken(null)
  setRefreshToken(null)
}

export const TOKEN_STORAGE_KEY = ACCESS_TOKEN_KEY

const axiosInstance = axios.create({
  baseURL : "https://bustoke-backend.onrender.com/v1",
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})

axiosInstance.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// =============================================================================
// FIX BUG-016: interceptor de response con auto-refresh del access_token.
// Si llega 401 (token expirado) y tenemos refresh_token, intentamos
// /v1/auth/refresh UNA vez y reintentamos la request original.
// =============================================================================

let isRefreshing = false
let refreshSubscribers = []

function subscribeTokenRefresh(callback) {
  refreshSubscribers.push(callback)
}

function onTokenRefreshed(newToken) {
  refreshSubscribers.forEach((cb) => cb(newToken))
  refreshSubscribers = []
}

function onRefreshFailed() {
  // FIX BUG-016: notifica a los requests en cola que el refresh
  // falló para que cada uno re-rechace con su propio error original.
  // El parámetro de error se ignora intencionalmente: los callers
  // ya propagan su propio error.
  refreshSubscribers.forEach((cb) => cb(null))
  refreshSubscribers = []
}

async function performRefresh() {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    throw new Error('No refresh_token disponible')
  }
  // Usamos axios crudo para evitar el interceptor (caller infinito)
  const res = await axios.post(
    `${axiosInstance.defaults.baseURL}/auth/refresh`,
    { refresh_token: refreshToken },
    { timeout: 10000 },
  )
  const newAccess = res?.data?.access_token
  const newRefresh = res?.data?.refresh_token
  if (!newAccess) {
    throw new Error('Refresh no devolvió access_token')
  }
  setTokens({ access: newAccess, refresh: newRefresh || refreshToken })
  return newAccess
}

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config
    const status = error?.response?.status

    // FIX BUG-016: detectar 401 e intentar refresh (excepto en el
    // propio endpoint de refresh, login o register, para evitar loop).
    const skipRefreshUrls = ['/auth/refresh', '/auth/login', '/auth/register']
    const url = originalRequest?.url || ''
    const isAuthEndpoint = skipRefreshUrls.some((u) => url.includes(u))

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint &&
      getRefreshToken()
    ) {
      originalRequest._retry = true

      if (isRefreshing) {
        // Otro request ya está refrescando: esperar el resultado.
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((newToken) => {
            if (!newToken) {
              reject(error)
              return
            }
            originalRequest.headers = originalRequest.headers || {}
            originalRequest.headers.Authorization = `Bearer ${newToken}`
            resolve(axiosInstance(originalRequest))
          })
        })
      }

      isRefreshing = true
      try {
        const newToken = await performRefresh()
        isRefreshing = false
        onTokenRefreshed(newToken)
        originalRequest.headers = originalRequest.headers || {}
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return axiosInstance(originalRequest)
      } catch (refreshErr) {
        isRefreshing = false
        onRefreshFailed(refreshErr)
        // Limpiar tokens para forzar re-login
        clearAllTokens()
        return Promise.reject(error)
      }
    }

    // Normalización de errores estándar
    const data = error?.response?.data
    let detail = data?.detail ?? data?.message ?? error?.message

    if (Array.isArray(detail)) {
      detail = detail
        .map((item) => {
          if (!item) return ''
          if (typeof item === 'string') return item
          if (item.msg) {
            const loc = Array.isArray(item.loc) ? item.loc.join('.') : ''
            return loc ? `${loc}: ${item.msg}` : item.msg
          }
          return ''
        })
        .filter(Boolean)
        .join(' · ')
    } else if (detail && typeof detail === 'object') {
      detail = detail.msg || JSON.stringify(detail)
    }

    const message =
      (typeof detail === 'string' && detail) ||
      'Error inesperado al comunicarse con el servidor.'

    const normalized = new Error(message)
    normalized.status = error?.response?.status
    normalized.original = error
    return Promise.reject(normalized)
  },
)

export default axiosInstance
