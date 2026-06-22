import { Bus, MapPin } from 'lucide-react'

function formatPrice(value) {
  const safe = Number.isFinite(value) ? value : 0
  return `S/ ${safe.toFixed(2)}`
}

function TimeStop({ time, city }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-base font-semibold text-neutral-900">{time}</span>
      <span className="text-xs text-neutral-500 truncate" title={city}>
        {city}
      </span>
    </div>
  )
}

function BusLine() {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="w-12 border-t border-dashed border-neutral-300" />
      <Bus className="w-4 h-4 text-blue-600 shrink-0" />
      <div className="w-12 border-t border-dashed border-neutral-300" />
    </div>
  )
}

function SeatsBadge({ seatsLeft }) {
  const safe = Number.isFinite(seatsLeft) ? seatsLeft : 0
  const isLow = safe > 0 && safe <= 5
  const isOut = safe <= 0
  const styles = isOut
    ? 'bg-red-50 text-red-600 border-red-100'
    : isLow
      ? 'bg-orange-50 text-orange-600 border-orange-100'
      : 'bg-emerald-50 text-emerald-700 border-emerald-100'
  const label = isOut
    ? 'Sin cupos'
    : safe === 1
      ? '1 cupo libre'
      : `${safe} cupos libres`
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium border rounded-md px-2 py-0.5 ${styles}`}
    >
      {label}
    </span>
  )
}

function BoardingPoint({ point }) {
  if (!point) return null
  return (
    <span className="inline-flex items-start gap-1.5 text-xs text-neutral-600 max-w-full">
      <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
      <span
        className="whitespace-normal text-xs leading-relaxed text-neutral-600 break-words"
        title={point}
      >
        Embarque: {point}
      </span>
    </span>
  )
}

export default function BusCardDesktop({ trip, selected, onSelect, onChooseSeats }) {
  const seats = Number.isFinite(trip?.seatsLeft) ? trip.seatsLeft : 0
  const isOut = seats <= 0

  const rawTypes =
    trip?.tipos_asiento ??
    trip?.tiposAsiento ??
    trip?.seatTypes ??
    trip?.tipoAsiento ??
    trip?.asientos ??
    []
  const safeTypes = Array.isArray(rawTypes) ? rawTypes : []

  return (
    <div
      className={`border rounded-xl p-4 flex items-center justify-between bg-white shadow-sm transition-colors ${
        selected
          ? 'border-blue-600 ring-1 ring-blue-600'
          : 'border-neutral-200 hover:border-neutral-300'
      } ${isOut ? 'opacity-90' : ''}`}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-sm font-semibold text-neutral-900">
            {trip.company}
          </span>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <TimeStop time={trip.departureTime} city={trip.origin} />
            <BusLine />
            <TimeStop time={trip.arrivalTime} city={trip.destination} />
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <SeatsBadge seatsLeft={seats} />
            <BoardingPoint point={trip.boardingPoint} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <div className="flex flex-col items-end gap-2">
          <span className="text-base font-bold text-neutral-900">
            Desde {formatPrice(trip.priceFrom)}
          </span>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {safeTypes.map((asiento, index) => {
              const key = String(asiento ?? '').toLowerCase()
              const styles =
                key === 'vip'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-blue-50 text-blue-700 border border-blue-200'
              return (
                <span
                  key={`${String(asiento ?? '')}-${index}`}
                  className={`inline-flex items-center text-xs px-2 py-0.5 rounded-md font-medium uppercase leading-none ${styles}`}
                >
                  {String(asiento ?? '').toUpperCase()}
                </span>
              )
            })}
          </div>
        </div>
        <button
          type="button"
          disabled={isOut}
          onClick={() => {
            if (isOut) return
            onSelect?.(trip.id)
            onChooseSeats?.(trip)
          }}
          className={`font-medium rounded-lg px-4 py-2 transition-colors ${
            isOut
              ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isOut ? 'Agotado' : 'Elegir Asientos'}
        </button>
      </div>
    </div>
  )
}
