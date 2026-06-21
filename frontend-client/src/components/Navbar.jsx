import { Bus, Compass } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AvatarMenu from './AvatarMenu'

const NAV_ITEMS = [
  { id: 'mis-viajes', label: 'Mis viajes', icon: Compass },
]

function LoginButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border border-blue-600 text-blue-600 hover:bg-blue-50 font-medium px-4 py-2 rounded-xl transition-all text-sm"
    >
      Iniciar sesión
    </button>
  )
}

function LogoButton({ onLogoClick }) {
  const navigate = useNavigate()

  const handleClick = () => {
    if (onLogoClick) {
      onLogoClick()
    } else {
      navigate('/', { replace: true })
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center gap-2 text-blue-600 cursor-pointer hover:opacity-90 transition-opacity"
      aria-label="Ir a inicio"
    >
      <Bus className="w-6 h-6" />
      <span className="text-xl font-bold tracking-tight">BUSTOKE</span>
    </button>
  )
}

export default function Navbar({
  onNavigate,
  active,
  hideNavItems = false,
  authSlot,
  timerSlot,
  onLoginClick,
  onLogoClick,
}) {
  const { isAuthenticated, user } = useAuth()

  const handleLogin = () => {
    if (onLoginClick) onLoginClick()
    else onNavigate?.('login')
  }

  return (
    <nav className="hidden md:flex w-full bg-white border-b border-neutral-200 h-16 items-center justify-between px-8 sticky top-0 z-30">
      <LogoButton onLogoClick={onLogoClick} />

      {authSlot ? null : hideNavItems ? null : (
        <div className="flex items-center gap-3">
          {timerSlot}
          {isAuthenticated && (
            <>
              {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
                const isActive = id === active
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onNavigate?.(id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'text-blue-600 bg-blue-50'
                        : 'text-neutral-600 hover:text-blue-600 hover:bg-neutral-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                )
              })}
              <div className="ml-2 flex items-center gap-2">
                <AvatarMenu user={user} onNavigate={onNavigate} />
              </div>
            </>
          )}
          {!isAuthenticated && (
            <div className="ml-2">
              <LoginButton onClick={handleLogin} />
            </div>
          )}
        </div>
      )}
    </nav>
  )
}
