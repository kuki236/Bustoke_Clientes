import { Minus, Plus } from 'lucide-react'

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

  const wrapperBase =
    'flex items-center justify-center gap-2 bg-neutral-100 rounded-xl p-1'
  const numberBase =
    'text-neutral-900 font-semibold text-base mx-3 min-w-6 text-center tabular-nums'
  const buttonBase =
    'inline-flex items-center justify-center rounded-lg border bg-white transition-colors w-12 h-12 md:w-7 md:h-7 border-neutral-200 text-neutral-700 active:scale-95 md:active:scale-100'
  const buttonDisabled =
    'border-neutral-100 text-neutral-300 cursor-not-allowed md:border-neutral-100 md:text-neutral-300'

  return (
    <div className="flex flex-col gap-1 min-w-0 flex-1">
      <label className="text-xs font-medium text-neutral-500">{label}</label>
      <div className={wrapperBase} role="group" aria-label={label}>
        <button
          type="button"
          onClick={() => canDecrement && setValue(current - 1)}
          disabled={!canDecrement}
          aria-label="Reducir pasajeros"
          className={`${buttonBase} ${!canDecrement ? buttonDisabled : 'hover:bg-neutral-50'}`}
        >
          <Minus className="w-5 h-5 md:w-3.5 md:h-3.5" />
        </button>
        <span className={numberBase} aria-live="polite">
          {current}
        </span>
        <button
          type="button"
          onClick={() => canIncrement && setValue(current + 1)}
          disabled={!canIncrement}
          aria-label="Aumentar pasajeros"
          className={`${buttonBase} ${!canIncrement ? buttonDisabled : 'hover:bg-neutral-50'}`}
        >
          <Plus className="w-5 h-5 md:w-3.5 md:h-3.5" />
        </button>
      </div>
    </div>
  )
}
