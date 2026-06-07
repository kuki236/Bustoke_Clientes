import { Search, Compass, User } from 'lucide-react'

const ITEMS = [
  { id: 'search', label: 'Buscar', icon: Search },
  { id: 'trips', label: 'Mis viajes', icon: Compass },
  { id: 'profile', label: 'Perfil', icon: User },
]

export default function BottomNav({ active = 'search' }) {
  return (
    <nav className="block md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 flex justify-around items-center py-2 z-50 shadow-lg">
      {ITEMS.map(({ id, label, icon: Icon }) => {
        const isActive = id === active
        return (
          <button
            key={id}
            type="button"
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
