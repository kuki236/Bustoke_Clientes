import { Search, Compass, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const ITEMS = [
  { id: 'buscar', label: 'Buscar', icon: Search },
  { id: 'mis-viajes', label: 'Mis viajes', icon: Compass },
  { id: 'perfil', label: 'Perfil', icon: User },
]

export default function BottomNav({ active = 'buscar', onNavigate }) {
  const { isAuthenticated } = useAuth()

  const handlePress = (id) => {
    if (id === 'perfil' && !isAuthenticated) {
      onNavigate?.('login')
      return
    }
    onNavigate?.(id)
  }

  return (
    <nav className="block md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 flex justify-around items-center py-2 z-50 shadow-lg">
      {ITEMS.map(({ id, label, icon: Icon }) => {
        const isActive = id === active
        return (
          <button
            key={id}
            type="button"
            onClick={() => handlePress(id)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${
              isActive ? 'text-blue-600' : 'text-neutral-400'
            }`}
          >
            <Icon className="w-5 h-5" strokeWidth={isActive ? 2.25 : 2} />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
