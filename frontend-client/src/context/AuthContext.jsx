import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  clearAccessToken,
  setAccessToken,
  getAccessToken,
} from '../api/axiosInstance'
import {
  fetchMeRequest,
  loginRequest,
  registerRequest,
} from '../api/auth'

const AuthContext = createContext(null)

const INITIAL_USER = null

export function AuthProvider({ children }) {
  const hasInitialToken = Boolean(getAccessToken())
  const [user, setUser] = useState(INITIAL_USER)
  const [loading, setLoading] = useState(hasInitialToken)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!hasInitialToken) return undefined
    let cancelled = false
    fetchMeRequest()
      .then((hydratedUser) => {
        if (cancelled) return
        setUser(hydratedUser)
      })
      .catch((err) => {
        if (cancelled) return
        clearAccessToken()
        setUser(INITIAL_USER)
        if (err?.status !== 401) {
          setError(err?.message || 'No se pudo rehidratar la sesión.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [hasInitialToken])

  const loginUser = useCallback(async (email, password) => {
    setError(null)
    try {
      const { token, user: fetchedUser } = await loginRequest({ email, password })
      if (token) setAccessToken(token)
      setUser(fetchedUser)
      return fetchedUser
    } catch (err) {
      setError(err?.message || 'No se pudo iniciar sesión.')
      throw err
    }
  }, [])

  const registerUser = useCallback(async (formData) => {
    setError(null)
    try {
      const { token, user: registeredUser } = await registerRequest({
        nombres: formData.nombres,
        apellido_paterno: formData.apellido_paterno,
        apellido_materno: formData.apellido_materno,
        tipo_documento: formData.tipo_documento,
        numero_documento: formData.numero_documento,
        email: formData.email ?? formData.correo,
        contrasena: formData.contrasena ?? formData.password,
        telefono: formData.telefono,
      })
      if (token) {
        setAccessToken(token)
        setUser(registeredUser)
      }
      return { token, user: registeredUser }
    } catch (err) {
      setError(err?.message || 'No se pudo completar el registro.')
      throw err
    }
  }, [])

  const logout = useCallback(() => {
    clearAccessToken()
    setUser(INITIAL_USER)
    setError(null)
  }, [])

  const updateUser = useCallback((partial) => {
    setUser((prev) => (prev ? { ...prev, ...partial } : prev))
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      isAuthenticated: Boolean(user),
      loginUser,
      registerUser,
      logout,
      updateUser,
    }),
    [user, loading, error, loginUser, registerUser, logout, updateUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() { // eslint-disable-line react-refresh/only-export-components
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
