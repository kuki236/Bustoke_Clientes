import { LogIn, LogOut, Bus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const ITEMS = [
  { id: 'buscar', label: 'Buscar' },
  { id: 'mis-viajes', label: 'Mis viajes' },
  { id: 'perfil', label: 'Perfil' },
]

function LoginButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
    >
      <LogIn className="w-4 h-4" />
      Iniciar sesión
    </button>
  )
}

function LogoutButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Cerrar sesión"
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-neutral-600 hover:text-red-600 hover:bg-red-50 transition-colors"
    >
      <LogOut className="w-4 h-4" />
      Salir
    </button>
  )
}

export default function Navbar({
  onNavigate,
  active,
  hideNavItems = false,
  authSlot,
  onLoginClick,
}) {
  const { isAuthenticated, logout } = useAuth()

  const handleLogo = () => {
    onNavigate?.('buscar')
  }

  return (
    <nav className="hidden md:flex w-full bg-white border-b border-neutral-200 h-16 items-center justify-between px-8 sticky top-0 z-30">
      <button
        type="button"
        onClick={handleLogo}
        className="flex items-center gap-2 text-blue-600"
        aria-label="Ir a inicio"
      >
        <Bus className="w-6 h-6" />
        <span className="text-xl font-bold tracking-tight">BUSTOKE</span>
      </button>

      {authSlot ? (
        <div className="flex items-center gap-3">
          {authSlot === 'login' || authSlot === 'registro' ? (
            <span className="text-sm text-neutral-600 hidden lg:inline">
              ¿Aún no tienes cuenta?
            </span>
          ) : null}
          {authSlot === 'registro' && (
            <LoginButton onClick={onLoginClick} />
          )}
        </div>
      ) : hideNavItems ? null : (
        <ul className="flex items-center gap-1">
          {ITEMS.map(({ id, label }) => {
            const isActive = id === active
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onNavigate?.(id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-blue-600 bg-blue-50'
                      : 'text-neutral-600 hover:text-blue-600 hover:bg-neutral-50'
                  }`}
                >
                  {label}
                </button>
              </li>
            )
          })}
          <li className="ml-2">
            {isAuthenticated ? (
              <LogoutButton onClick={logout} />
            ) : (
              <LoginButton onClick={() => onNavigate?.('login')} />
            )}
          </li>
        </ul>
      )}
    </nav>
  )
}
