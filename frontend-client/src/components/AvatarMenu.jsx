import {
  BookText,
  ChevronDown,
  Compass,
  LogOut,
  UserRound,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const MENU_ITEMS = [
  { id: 'perfil', label: 'Mi Perfil', icon: UserRound },
  { id: 'mis-viajes', label: 'Mis Viajes', icon: Compass },
  { id: 'reclamos', label: 'Mis Reclamos', icon: BookText },
]

function getInitials(user) {
  const full = `${user?.nombres || user?.names || user?.name || ''} ${
    user?.apellido_paterno || user?.paternalSurname || ''
  }`.trim()
  if (!full) {
    const email = user?.email || ''
    if (email) return email.slice(0, 2).toUpperCase()
    return 'U'
  }
  const parts = full.split(/\s+/).filter(Boolean)
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

export default function AvatarMenu({
  user,
  onNavigate,
  className = '',
  variant = 'light',
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)
  const navigate = useNavigate()
  const { logout } = useAuth()

  const initials = getInitials(user)
  const displayName = getDisplayName(user)
  const email = user?.email || user?.correo || ''

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

  const handleItem = (tab) => {
    setIsOpen(false)
    onNavigate?.(tab)
  }

  const handleLogout = () => {
    setIsOpen(false)
    logout()
    if (!onNavigate) navigate('/', { replace: true })
  }

  const isLight = variant === 'light'

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Abrir menú de usuario"
        className="flex items-center gap-2 rounded-full hover:opacity-90 transition-opacity"
      >
        <span
          className={`flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold transition-all duration-200 ${
            isLight
              ? 'bg-white text-blue-600 ring-2 ring-blue-100'
              : 'bg-blue-600 text-white ring-2 ring-blue-600/20 hover:bg-blue-700'
          }`}
        >
          {initials}
        </span>
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 ${
            isLight ? 'text-white' : 'text-neutral-600'
          } ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="Menú de usuario"
          className="absolute right-0 mt-2 w-60 bg-white rounded-xl shadow-lg border border-neutral-100 z-50 overflow-hidden"
        >
          <div className="px-4 py-3 bg-neutral-50">
            <p className="text-sm font-semibold text-neutral-900 truncate">
              {displayName}
            </p>
            {email && (
              <p className="text-xs text-neutral-500 truncate">{email}</p>
            )}
          </div>

          <div className="border-b border-neutral-100" />

          <div className="py-1">
            {MENU_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="menuitem"
                onClick={() => handleItem(id)}
                className="w-full text-left hover:bg-neutral-50 px-4 py-2.5 flex items-center gap-3 text-sm text-neutral-700"
              >
                <Icon className="w-4 h-4 text-neutral-500" />
                {label}
              </button>
            ))}
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
