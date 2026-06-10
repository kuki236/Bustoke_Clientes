import { Bus, MapPin } from 'lucide-react'

function formatPrice(value) {
  const safe = Number.isFinite(value) ? value : 0
  return `S/ ${safe.toFixed(2)}`
}

function stripCompanyFromTerminal(terminal, company) {
  if (!terminal || typeof terminal !== 'string') return terminal || ''
  if (!company || typeof company !== 'string') return terminal
  const cleaned = terminal
    .split(/\s*[-–—|·,]\s*/)
    .map((part) => part.trim())
    .filter((part) => part && part.toLowerCase() !== company.trim().toLowerCase())
  return cleaned.length > 0 ? cleaned.join(' - ') : terminal.replace(company, '').trim()
}

function formatTime(time) {
  if (!time) return ''
  return time
}

function TimeStop({ time, city, company }) {
  const cleanCity = stripCompanyFromTerminal(city, company)
  return (
    <div className="flex flex-col items-center">
      <span className="text-base font-semibold text-neutral-900 leading-none mb-1">
        {formatTime(time)}
      </span>
      <span className="text-[11px] text-neutral-500 mt-1 text-center leading-tight max-w-[110px]">
        {cleanCity}
      </span>
    </div>
  )
}

function BusLine() {
  return (
    <div className="flex items-center gap-2 mx-3 min-w-[80px]">
      <div className="flex-1 border-t border-dashed border-neutral-300" />
      <Bus className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
      <div className="flex-1 border-t border-dashed border-neutral-300" />
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
      className={`inline-flex items-center text-xs font-medium border rounded-md px-2.5 py-1 leading-none ${styles}`}
    >
      {label}
    </span>
  )
}

function BoardingPoint({ point }) {
  if (!point) return null
  return (
    <span className="inline-flex items-start gap-1.5 max-w-full mb-4">
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

export default function BusCardMobile({ trip, selected, onSelect, onChooseSeats }) {
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
      className={`rounded-2xl p-5 shadow-card flex flex-col gap-4 bg-white border transition-colors ${
        selected
          ? 'border-blue-600 ring-1 ring-blue-600'
          : 'border-neutral-100'
      } ${isOut ? 'opacity-95' : ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-neutral-900 truncate min-w-0">
          {trip.company}
        </span>
        <span className="text-sm font-bold text-neutral-900 shrink-0">
          Desde {formatPrice(trip.priceFrom)}
        </span>
      </div>

      <div className="flex items-center justify-center">
        <TimeStop
          time={trip.departureTime}
          city={trip.origin}
          company={trip.company}
        />
        <BusLine />
        <TimeStop
          time={trip.arrivalTime}
          city={trip.destination}
          company={trip.company}
        />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {safeTypes.map((asiento, index) => {
            const key = String(asiento ?? '').toLowerCase()
            const styles =
              key === 'vip'
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
            return (
              <span
                key={`${String(asiento ?? '')}-${index}`}
                className={`inline-flex items-center text-xs px-2.5 py-1 rounded-md font-medium uppercase leading-none ${styles}`}
              >
                {String(asiento ?? '').toUpperCase()}
              </span>
            )
          })}
        </div>
        <SeatsBadge seatsLeft={seats} />
      </div>

      <BoardingPoint point={trip.boardingPoint} />

      <button
        type="button"
        disabled={isOut}
        onClick={() => {
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
    </div>
  )
}
