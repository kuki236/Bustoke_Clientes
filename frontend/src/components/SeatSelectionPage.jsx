import { useMemo, useState } from 'react'
import { ArrowLeft, Star, ArrowUp, Bath } from 'lucide-react'
import Navbar from './Navbar'
import BottomNav from './BottomNav'

const ROWS = ['A', 'B', 'C', 'D']

const FLOOR_1_SEATS = [
  { row: 'A', col: 1, status: 'libre' },
  { row: 'A', col: 2, status: 'libre' },
  { row: 'A', col: 3, status: 'libre' },
  { row: 'A', col: 4, status: 'libre' },
  { row: 'B', col: 1, status: 'libre' },
  { row: 'B', col: 2, status: 'bloqueado' },
  { row: 'B', col: 3, status: 'libre' },
  { row: 'B', col: 4, status: 'libre' },
  { row: 'C', col: 1, status: 'ocupado' },
  { row: 'C', col: 2, status: 'libre' },
  { row: 'C', col: 3, status: 'libre' },
  { row: 'C', col: 4, status: 'bloqueado' },
  { row: 'D', col: 1, status: 'libre' },
  { row: 'D', col: 2, status: 'libre' },
  { row: 'D', col: 3, status: 'libre' },
  { row: 'D', col: 4, status: 'libre' },
]

const FLOOR_2_SEATS = [
  { row: 'A', col: 1, status: 'libre' },
  { row: 'A', col: 2, status: 'libre' },
  { row: 'A', col: 3, status: 'libre' },
  { row: 'A', col: 4, status: 'libre' },
  { row: 'B', col: 1, status: 'bloqueado' },
  { row: 'B', col: 2, status: 'libre' },
  { row: 'B', col: 3, status: 'libre' },
  { row: 'B', col: 4, status: 'ocupado' },
  { row: 'C', col: 1, status: 'libre' },
  { row: 'C', col: 2, status: 'libre' },
  { row: 'C', col: 3, status: 'libre' },
  { row: 'C', col: 4, status: 'libre' },
  { row: 'D', col: 1, status: 'libre' },
  { row: 'D', col: 2, status: 'bloqueado' },
  { row: 'D', col: 3, status: 'libre' },
  { row: 'D', col: 4, status: 'libre' },
]

function SteeringWheel({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 14V8" />
      <path d="m9 11 -3.5 -2" />
      <path d="m15 11 3.5 -2" />
    </svg>
  )
}

function SeatButton({ id, status, isVip, selected, onToggle }) {
  const isInteractive = status === 'libre'

  const base =
    'relative h-10 w-10 rounded-lg flex flex-col items-center justify-center text-xs font-semibold border transition-colors'

  if (selected) {
    return (
      <button
        type="button"
        onClick={isInteractive ? onToggle : undefined}
        className={`${base} bg-blue-600 text-white border-transparent`}
        aria-pressed="true"
        aria-label={`Asiento ${id} seleccionado`}
      >
        {isVip && (
          <Star
            className="w-2.5 h-2.5 mb-px fill-orange-300 text-orange-300"
            strokeWidth={0}
          />
        )}
        <span>{id}</span>
      </button>
    )
  }

  if (status === 'ocupado') {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-label={`Asiento ${id} ocupado`}
        className={`${base} bg-red-600 text-white border-transparent font-medium cursor-not-allowed`}
      >
        {isVip && (
          <Star
            className="w-2.5 h-2.5 mb-px fill-white/80 text-white/80"
            strokeWidth={0}
          />
        )}
        <span>{id}</span>
      </button>
    )
  }

  if (status === 'bloqueado') {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-label={`Asiento ${id} bloqueado`}
        className={`${base} bg-neutral-200 text-neutral-400 border-transparent pointer-events-none`}
      >
        {isVip && <Star className="w-2.5 h-2.5 mb-px text-neutral-400" />}
        <span>{id}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed="false"
      aria-label={`Asiento ${id} libre`}
      className={`${base} bg-white text-neutral-600 border-blue-500 hover:bg-blue-50 active:bg-blue-100`}
    >
      {isVip && (
        <Star
          className="w-2.5 h-2.5 mb-px fill-orange-600 text-orange-600"
          strokeWidth={0}
        />
      )}
      <span>{id}</span>
    </button>
  )
}

function SeatGrid({ seats, floor, isVip, selectedSeats, onToggle }) {
  return (
    <div className="flex flex-col items-center gap-2">
      {ROWS.map((row) => {
        const leftSeats = seats.filter((s) => s.row === row && s.col <= 2)
        const rightSeats = seats.filter((s) => s.row === row && s.col > 2)
        return (
          <div key={row} className="flex items-center gap-2">
            {leftSeats.map((seat) => {
              const id = `${row}${seat.col}`
              const fullId = `${floor}-${id}`
              return (
                <SeatButton
                  key={fullId}
                  id={id}
                  status={seat.status}
                  isVip={isVip}
                  selected={selectedSeats.includes(fullId)}
                  onToggle={() => onToggle(fullId, seat.status)}
                />
              )
            })}
            <div className="w-6" aria-hidden="true" />
            {rightSeats.map((seat) => {
              const id = `${row}${seat.col}`
              const fullId = `${floor}-${id}`
              return (
                <SeatButton
                  key={fullId}
                  id={id}
                  status={seat.status}
                  isVip={isVip}
                  selected={selectedSeats.includes(fullId)}
                  onToggle={() => onToggle(fullId, seat.status)}
                />
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function BusLayout({ seats, floor, isVip = false, selectedSeats, onToggle }) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-100 shadow-card p-5">
      <div className="flex items-center justify-start mb-4">
        <div
          className="w-10 h-10 rounded-md bg-neutral-100 text-neutral-600 flex items-center justify-center"
          aria-label="Timón del conductor"
        >
          <SteeringWheel className="w-5 h-5" />
        </div>
      </div>

      <SeatGrid
        seats={seats}
        floor={floor}
        isVip={isVip}
        selectedSeats={selectedSeats}
        onToggle={onToggle}
      />

      <div className="flex items-center justify-between mt-5">
        <div
          className="w-10 h-10 rounded-md bg-neutral-100 text-neutral-600 flex items-center justify-center"
          aria-label="Escalera de acceso"
        >
          <ArrowUp className="w-5 h-5" />
        </div>
        <div
          className="w-10 h-10 rounded-md bg-neutral-100 text-neutral-600 flex items-center justify-center"
          aria-label="Baño"
        >
          <Bath className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}

function Legend() {
  const items = [
    { label: 'Libre', swatch: 'bg-white border-blue-500' },
    { label: 'Ocupado', swatch: 'bg-red-600 border-transparent' },
    { label: 'Bloqueado', swatch: 'bg-neutral-200 border-transparent' },
  ]
  return (
    <div className="flex items-center justify-center gap-6 py-4 text-xs text-neutral-600">
      {items.map(({ label, swatch }) => (
        <div key={label} className="flex items-center gap-2">
          <span
            className={`w-5 h-5 rounded-md border ${swatch}`}
            aria-hidden="true"
          />
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}

function FloorTabs({ activeFloor, onChange }) {
  const tabs = [
    { id: '1', label: 'Piso 1' },
    { id: '2', label: 'Piso 2' },
  ]
  return (
    <div className="inline-flex bg-blue-700 rounded-full p-1">
      {tabs.map(({ id, label }) => {
        const isActive = activeFloor === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`px-5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              isActive
                ? 'bg-white text-blue-600'
                : 'bg-transparent text-white hover:bg-white/10'
            }`}
            aria-pressed={isActive}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function CheckoutBar({ selectedSeats, total, onContinue, dense = false }) {
  const disabled = selectedSeats.length === 0
  const displaySeats = selectedSeats.map((s) => s.split('-').slice(1).join('-'))
  const label = displaySeats.length === 0 ? '—' : displaySeats.join(', ')
  return (
    <div
      className={`bg-white rounded-2xl border border-neutral-100 shadow-card ${
        dense ? 'p-4 flex flex-col gap-3' : 'p-5 flex items-center justify-between gap-4'
      }`}
    >
      <div className={dense ? '' : 'flex-1 min-w-0'}>
        <p className="text-sm text-neutral-600">
          Asientos Seleccionados:{' '}
          <span className="font-semibold text-neutral-900 break-words">
            {label}
          </span>
        </p>
        <p className="text-lg font-bold text-neutral-900 mt-1">
          Total: S/ {total.toFixed(2)}
        </p>
      </div>
      <button
        type="button"
        onClick={onContinue}
        disabled={disabled}
        className={`rounded-xl font-semibold transition-colors ${
          dense ? 'w-full py-3' : 'px-6 py-3 shrink-0'
        } ${
          disabled
            ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        Continuar a Checkout
      </button>
    </div>
  )
}

export default function SeatSelectionPage({ trip, date, onBack, onContinue, onNavigate }) {
  const [selectedSeats, setSelectedSeats] = useState([])
  const [activeFloor, setActiveFloor] = useState('1')

  const precioBase = trip?.priceFrom ?? 85
  const total = useMemo(
    () => selectedSeats.length * precioBase,
    [selectedSeats, precioBase],
  )

  const company = trip?.company ?? 'Cruz del Sur'
  const origin = trip?.origin ?? 'Lima'
  const destination = trip?.destination ?? 'Trujillo'
  const departureTime = trip?.departureTime ?? '08:00 AM'
  const displayDate = date || '15/06/2026'
  const seatType = activeFloor === '2' ? 'VIP' : 'Normal'

  const handleToggle = (seatId, status) => {
    if (status === 'ocupado' || status === 'bloqueado') return
    setSelectedSeats((prev) =>
      prev.includes(seatId)
        ? prev.filter((s) => s !== seatId)
        : [...prev, seatId],
    )
  }

  const handleContinue = () => {
    if (selectedSeats.length === 0) return
    onContinue?.(selectedSeats, total)
  }

  const tripTitle = `${company} • ${origin} a ${destination}`

  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="hidden md:block">
        <Navbar onNavigate={onNavigate} active="buscar" />
        <div className="max-w-7xl mx-auto px-8 py-10">
          <header className="text-center mb-10">
            <h1 className="text-2xl font-bold text-neutral-900">
              Selecciona tus asientos
            </h1>
            <p className="text-sm text-neutral-600 mt-2">
              {company} • {origin} a {destination} • {displayDate} • {departureTime}
            </p>
          </header>

          <div className="grid md:grid-cols-2 gap-8">
            <section className="flex flex-col gap-4">
              <h2 className="text-center text-lg font-semibold text-neutral-900">
                Primer Piso
              </h2>
              <BusLayout
                seats={FLOOR_1_SEATS}
                floor="1"
                isVip={false}
                selectedSeats={selectedSeats}
                onToggle={handleToggle}
              />
            </section>
            <section className="flex flex-col gap-4">
              <h2 className="text-center text-lg font-semibold text-neutral-900">
                Segundo Piso
              </h2>
              <BusLayout
                seats={FLOOR_2_SEATS}
                floor="2"
                isVip={true}
                selectedSeats={selectedSeats}
                onToggle={handleToggle}
              />
            </section>
          </div>

          <Legend />

          <div className="mt-4">
            <CheckoutBar
              selectedSeats={selectedSeats}
              total={total}
              onContinue={handleContinue}
            />
          </div>
        </div>
      </div>

      <div className="block md:hidden pb-28">
        <header className="bg-blue-600 text-white p-5 text-center">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={onBack}
              aria-label="Volver a los resultados"
              className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <p className="flex-1 text-sm font-semibold leading-snug text-center pr-7">
              {tripTitle}
            </p>
          </div>
          <FloorTabs activeFloor={activeFloor} onChange={setActiveFloor} />
          <p className="text-xs text-white/80 mt-3">
            Asientos: {seatType} · S/ {precioBase.toFixed(2)} c/u
          </p>
        </header>

        <main className="flex flex-col gap-4 p-4">
          <BusLayout
            seats={activeFloor === '1' ? FLOOR_1_SEATS : FLOOR_2_SEATS}
            floor={activeFloor}
            isVip={activeFloor === '2'}
            selectedSeats={selectedSeats}
            onToggle={handleToggle}
          />
          <Legend />
          <CheckoutBar
            selectedSeats={selectedSeats}
            total={total}
            onContinue={handleContinue}
            dense
          />
        </main>

        <BottomNav active="buscar" onNavigate={onNavigate} />
      </div>
    </div>
  )
}
