import { Bell, Bus } from 'lucide-react'

export default function MobileHeader() {
  return (
    <header className="block md:hidden bg-blue-600 text-white px-5 pt-6 pb-32">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bus className="w-6 h-6" />
          <span className="text-lg font-bold tracking-tight">BUSTOKE</span>
        </div>
        <button
          type="button"
          aria-label="Notificaciones"
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
        >
          <Bell className="w-5 h-5" />
        </button>
      </div>
    </header>
  )
}
