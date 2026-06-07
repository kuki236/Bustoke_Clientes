import { Bus } from 'lucide-react'

function formatPrice(value) {
  return `S/ ${value.toFixed(2)}`
}

function TimeStop({ time, city }) {
  return (
    <div className="flex flex-col">
      <span className="text-base font-semibold text-neutral-900">{time}</span>
      <span className="text-xs text-neutral-500">{city}</span>
    </div>
  )
}

function BusLine() {
  return (
    <div className="flex items-center gap-2 mx-4 min-w-[120px]">
      <div className="flex-1 border-t border-dashed border-neutral-300" />
      <Bus className="w-4 h-4 text-blue-600 shrink-0" />
      <div className="flex-1 border-t border-dashed border-neutral-300" />
    </div>
  )
}

export default function BusCardDesktop({ trip, selected, onSelect, onChooseSeats }) {
  return (
    <label
      className={`border rounded-xl p-4 flex items-center justify-between bg-white shadow-sm transition-colors cursor-pointer ${
        selected
          ? 'border-blue-600 ring-1 ring-blue-600'
          : 'border-neutral-200 hover:border-neutral-300'
      }`}
    >
      <div className="flex items-center gap-4 min-w-0">
        <input
          type="radio"
          name="selected-trip"
          checked={selected}
          onChange={() => onSelect(trip.id)}
          className="w-4 h-4 text-blue-600 accent-blue-600 shrink-0"
        />
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-sm font-semibold text-neutral-900">
            {trip.company}
          </span>
          <div className="flex items-center">
            <TimeStop time={trip.departureTime} city={trip.origin} />
            <BusLine />
            <TimeStop time={trip.arrivalTime} city={trip.destination} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <div className="flex flex-col items-end gap-2">
          <span className="text-base font-bold text-neutral-900">
            Desde {formatPrice(trip.priceFrom)}
          </span>
          <div className="flex items-center gap-1.5">
            {trip.services.map((service) => (
              <span
                key={service}
                className="bg-blue-50 text-blue-600 rounded px-2 py-0.5 text-xs font-medium"
              >
                {service}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            onSelect(trip.id)
            onChooseSeats?.(trip)
          }}
          className="bg-blue-600 text-white font-medium rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors"
        >
          Elegir Asientos
        </button>
      </div>
    </label>
  )
}
