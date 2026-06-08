import { Bus, MapPin } from 'lucide-react'

function formatPrice(value) {
  const safe = Number.isFinite(value) ? value : 0
  return `S/ ${safe.toFixed(2)}`
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

function BoardingPoint({ point }) {
  if (!point) return null
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] text-neutral-600 min-w-0"
    >
      <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
      <span className="truncate" title={point}>
        Embarque: {point}
      </span>
    </span>
  )
}

export default function BusCardMobile({ trip, selected, onSelect, onChooseSeats }) {
  const seats = Number.isFinite(trip?.seatsLeft) ? trip.seatsLeft : 0
  const isOut = seats <= 0
  const isLow = seats > 0 && seats <= 5
  const seatsColor = isOut
    ? 'text-red-600'
    : isLow
      ? 'text-orange-600'
      : 'text-emerald-700'
  return (
    <label
      className={`rounded-2xl p-5 shadow-card flex flex-col gap-4 bg-white border transition-colors ${
        selected
          ? 'border-blue-600 ring-1 ring-blue-600'
          : 'border-neutral-100'
      } ${isOut ? 'opacity-95' : 'cursor-pointer'}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <input
            type="radio"
            name="selected-trip-mobile"
            checked={selected}
            onChange={() => onSelect(trip.id)}
            disabled={isOut}
            className="w-4 h-4 text-blue-600 accent-blue-600 shrink-0 disabled:cursor-not-allowed"
          />
          <span className="text-sm font-semibold text-neutral-900 truncate">
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

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {trip.services.map((service) => (
            <span
              key={service}
              className="bg-blue-50 text-blue-600 rounded px-2 py-0.5 text-xs font-medium"
            >
              {service}
            </span>
          ))}
        </div>
        <span className={`text-xs font-semibold ${seatsColor}`}>
          {isOut
            ? 'Sin cupos disponibles'
            : seats === 1
              ? '1 cupo libre'
              : `${seats} cupos libres`}
        </span>
      </div>

      <BoardingPoint point={trip.boardingPoint} />

      <button
        type="button"
        disabled={isOut}
        onClick={(e) => {
          e.preventDefault()
          if (isOut) return
          onSelect?.(trip.id)
          onChooseSeats?.(trip)
        }}
        className={`w-full font-medium rounded-lg py-2.5 transition-colors ${
          isOut
            ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {isOut ? 'Agotado' : 'Elegir Asientos'}
      </button>
    </label>
  )
}
