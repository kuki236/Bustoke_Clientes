import { Bell, Bus } from 'lucide-react'

export default function ResultsMobileHeader({ origin, destination, date, passengers }) {
  const passengerLabel = passengers === '1' ? 'pasajero' : 'pasajeros'

  return (
    <header className="block md:hidden bg-blue-600 text-white p-4 flex flex-col gap-2">
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
      <p className="text-sm font-semibold leading-snug">
        {origin} a {destination} · {date} · {passengers} {passengerLabel}
      </p>
    </header>
  )
}
