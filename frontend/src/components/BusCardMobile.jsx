import { Bus } from 'lucide-react'

function formatPrice(value) {
  return `S/ ${value.toFixed(2)}`
}

function TimeStop({ time, city }) {
  return (
    <div className="flex flex-col">
      <span className="text-sm font-semibold text-neutral-900">{time}</span>
      <span className="text-[11px] text-neutral-500">{city}</span>
    </div>
  )
}

function BusLine() {
  return (
    <div className="flex items-center gap-2 mx-3 min-w-[80px]">
      <div className="flex-1 border-t border-dashed border-neutral-300" />
      <Bus className="w-3.5 h-3.5 text-blue-600 shrink-0" />
      <div className="flex-1 border-t border-dashed border-neutral-300" />
    </div>
  )
}

export default function BusCardMobile({ trip, selected, onSelect, onChooseSeats }) {
  return (
    <label
      className={`rounded-2xl p-5 shadow-card flex flex-col gap-4 bg-white border transition-colors cursor-pointer ${
        selected
          ? 'border-blue-600 ring-1 ring-blue-600'
          : 'border-neutral-100'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            type="radio"
            name="selected-trip-mobile"
            checked={selected}
            onChange={() => onSelect(trip.id)}
            className="w-4 h-4 text-blue-600 accent-blue-600 shrink-0"
          />
          <span className="text-sm font-semibold text-neutral-900">
            {trip.company}
          </span>
        </div>
        <span className="text-right text-sm text-neutral-900 font-bold">
          Desde {formatPrice(trip.priceFrom)}
        </span>
      </div>

      <div className="flex items-center justify-center">
        <TimeStop time={trip.departureTime} city={trip.origin} />
        <BusLine />
        <TimeStop time={trip.arrivalTime} city={trip.destination} />
      </div>

      <div className="flex items-center justify-between">
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
        <span
          className="text-xs font-medium"
          style={{ color: 'var(--color-orange-600)' }}
        >
          Quedan {trip.seatsLeft} cupos libres
        </span>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          onSelect?.(trip.id)
          onChooseSeats?.(trip)
        }}
        className="w-full bg-blue-600 text-white font-medium rounded-lg py-2.5 hover:bg-blue-700 transition-colors"
      >
        Elegir Asientos
      </button>
    </label>
  )
}
