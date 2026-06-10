import { ArrowLeft, Bus } from 'lucide-react'

export default function ResultsMobileHeader({
  origin,
  destination,
  date,
  passengers,
  onBack,
}) {
  const passengerLabel = passengers === '1' ? 'pasajero' : 'pasajeros'

  return (
    <header className="block md:hidden bg-blue-600 text-white p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            aria-label="Volver a la búsqueda"
            onClick={onBack}
            className="p-1 -ml-1 rounded-full hover:bg-white/10 transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <Bus className="w-6 h-6 shrink-0" />
            <span className="text-lg font-bold tracking-tight truncate">
              BUSTOKE
            </span>
          </div>
        </div>
        <div className="w-7 h-7 shrink-0" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold leading-snug">
        {origin} a {destination} · {date} · {passengers} {passengerLabel}
      </p>
    </header>
  )
}
