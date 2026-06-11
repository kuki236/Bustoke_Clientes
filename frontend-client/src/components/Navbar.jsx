import {
  LogOut,
  Bus,
  Compass,
  ChevronDown,
  UserRound,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV_ITEMS = [
  { id: 'mis-viajes', label: 'Mis viajes', icon: Compass },
]

function getInitials(name) {
  if (!name) return 'U'
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getDisplayName(user) {
  if (user?.nombres) {
    return `${user.nombres} ${user.apellido_paterno || ''}`.trim()
  }
  return 'Pasajero Bustoke'
}

function getEmail(user) {
  return user?.email || user?.correo || ''
}

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

function AvatarMenu({ user, onNavigate, onLogout }) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)
  const initials = getInitials(
    `${user?.nombres || user?.nombre || ''} ${user?.apellido_paterno || ''}`.trim()
      || user?.name
      || user?.email,
  )
  const displayName = getDisplayName(user)
  const email = getEmail(user)

  useEffect(() => {
    if (!isOpen) return undefined
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    const handleKey = (event) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen])

  const handleNavigate = (tab) => {
    setIsOpen(false)
    onNavigate?.(tab)
  }

  const handleLogout = () => {
    setIsOpen(false)
    onLogout?.()
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Abrir menú de usuario"
        className="flex items-center gap-2 rounded-full hover:opacity-90 transition-opacity"
      >
        <span className="flex items-center justify-center w-9 h-9 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
          {initials}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-neutral-600 transition-transform duration-200 ${
            isOpen ? 'transform rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="Menú de usuario"
          className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-neutral-100 z-50 overflow-hidden"
        >
          <div className="px-4 py-3 bg-neutral-50">
            <p className="text-sm font-semibold text-neutral-900">
              {displayName}
            </p>
            {email && (
              <p className="text-xs text-neutral-500 truncate">{email}</p>
            )}
          </div>

          <div className="border-b border-neutral-100" />

          <div className="py-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => handleNavigate('perfil')}
              className="w-full text-left hover:bg-neutral-50 px-4 py-2.5 flex items-center gap-3 text-sm text-neutral-700"
            >
              <UserRound className="w-4 h-4 text-neutral-500" />
              Mi Perfil
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => handleNavigate('mis-viajes')}
              className="w-full text-left hover:bg-neutral-50 px-4 py-2.5 flex items-center gap-3 text-sm text-neutral-700"
            >
              <Compass className="w-4 h-4 text-neutral-500" />
              Mis Viajes
            </button>
          </div>

          <div className="border-b border-neutral-100" />

          <div className="py-1">
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="w-full text-left text-red-600 hover:bg-red-50 px-4 py-2.5 flex items-center gap-3 text-sm font-medium"
            >
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
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
  const { isAuthenticated, user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogin = () => {
    if (onLoginClick) onLoginClick()
    else onNavigate?.('login')
  }

  const handleLogout = () => {
    logout()
    navigate('/', { replace: true })
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
                <AvatarMenu
                  user={user}
                  onNavigate={onNavigate}
                  onLogout={handleLogout}
                />
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
