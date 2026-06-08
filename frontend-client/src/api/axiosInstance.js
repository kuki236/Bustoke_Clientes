import axios from 'axios'

const ACCESS_TOKEN_KEY = 'bustoke_access_token'

export function getAccessToken() {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY)
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

export function clearAccessToken() {
  setAccessToken(null)
}

export const TOKEN_STORAGE_KEY = ACCESS_TOKEN_KEY

const axiosInstance = axios.create({
  baseURL: 'http://localhost:8000/v1',
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

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
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
