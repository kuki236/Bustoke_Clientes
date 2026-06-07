import { createContext, useContext, useMemo, useState } from 'react'

const AuthContext = createContext(null)

const INITIAL_USER = null

export function AuthProvider({ children }) {
  const [user, setUser] = useState(INITIAL_USER)

  const login = (userData) => {
    setUser({
      email: userData?.email ?? '',
      names: userData?.names ?? '',
      paternalSurname: userData?.paternalSurname ?? '',
      maternalSurname: userData?.maternalSurname ?? '',
      docType: userData?.docType ?? 'DNI',
      docNumber: userData?.docNumber ?? '',
      accountType: 'Pasajero B2C',
    })
  }

  const logout = () => {
    setUser(INITIAL_USER)
  }

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      login,
      logout,
    }),
    [user],
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
