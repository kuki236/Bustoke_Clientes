import { Minus, Plus, Users } from 'lucide-react'

const MIN_PASSENGERS = 1
const MAX_PASSENGERS = 6

function clamp(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return MIN_PASSENGERS
  return Math.min(MAX_PASSENGERS, Math.max(MIN_PASSENGERS, Math.round(n)))
}

export default function PassengerStepper({
  label = 'Pasajeros',
  value,
  onChange,
  min = MIN_PASSENGERS,
  max = MAX_PASSENGERS,
}) {
  const current = clamp(value)
  const canDecrement = current > min
  const canIncrement = current < max

  function setValue(next) {
    const safe = Math.min(max, Math.max(min, next))
    onChange?.(String(safe))
  }

  return (
    <div className="flex flex-col gap-1 min-w-0 flex-1">
      <label className="text-xs font-medium text-neutral-500">{label}</label>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="w-4 h-4 text-neutral-500 shrink-0" />
          <span className="text-neutral-900 font-medium truncate">
            {current} {current === 1 ? 'pasajero' : 'pasajeros'}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0" role="group" aria-label={label}>
          <button
            type="button"
            onClick={() => canDecrement && setValue(current - 1)}
            disabled={!canDecrement}
            aria-label="Reducir pasajeros"
            className={`w-7 h-7 inline-flex items-center justify-center rounded-lg border transition-colors ${
              canDecrement
                ? 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                : 'border-neutral-100 text-neutral-300 cursor-not-allowed'
            }`}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span
            className="min-w-6 text-center text-sm font-semibold text-neutral-900 tabular-nums"
            aria-live="polite"
          >
            {current}
          </span>
          <button
            type="button"
            onClick={() => canIncrement && setValue(current + 1)}
            disabled={!canIncrement}
            aria-label="Aumentar pasajeros"
            className={`w-7 h-7 inline-flex items-center justify-center rounded-lg border transition-colors ${
              canIncrement
                ? 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                : 'border-neutral-100 text-neutral-300 cursor-not-allowed'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
