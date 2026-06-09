import { Search } from 'lucide-react'
import Autocomplete from './Autocomplete'
import {
  AGENCIES,
  PRICE_RANGE,
  SEAT_TYPES,
  SHIFTS,
} from '../data/agencies'

function FilterGroup({ title, children, action }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 accent-blue-600"
      />
      <span className="text-sm text-neutral-600">{label}</span>
    </label>
  )
}

function PriceRange({ priceMin, priceMax, min, max, onChange }) {
  const leftPercent = ((priceMin - min) / (max - min)) * 100
  const rightPercent = 100 - ((priceMax - min) / (max - min)) * 100

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs text-neutral-600">
        <span>
          Desde S/ <span className="font-semibold text-neutral-900">{priceMin}</span>
        </span>
        <span>
          Hasta S/ <span className="font-semibold text-neutral-900">{priceMax}</span>
        </span>
      </div>
      <div className="relative h-6 flex items-center">
        <div className="absolute inset-x-0 h-1 bg-neutral-200 rounded-full" />
        <div
          className="absolute h-1 bg-blue-600 rounded-full"
          style={{ left: `${leftPercent}%`, right: `${rightPercent}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={priceMin}
          onChange={(e) => {
            const v = Math.min(Number(e.target.value), priceMax - 1)
            onChange({ priceMin: v, priceMax })
          }}
          className="absolute inset-x-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-600 [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer"
          aria-label="Precio mínimo"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={priceMax}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), priceMin + 1)
            onChange({ priceMin, priceMax: v })
          }}
          className="absolute inset-x-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-600 [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer"
          aria-label="Precio máximo"
        />
      </div>
    </div>
  )
}

export default function FilterSidebar({
  values,
  onChange,
  filters,
  onApply,
  onClear,
}) {
  const PRICE_MIN_BOUND = PRICE_RANGE.min
  const PRICE_MAX_BOUND = PRICE_RANGE.max

  const emit = (overrides = {}) => {
    if (typeof onApply !== 'function') return
    onApply({
      priceMin: PRICE_MIN_BOUND,
      priceMax: PRICE_MAX_BOUND,
      companies: [],
      seatTypes: [],
      shifts: [],
      ...filters,
      ...overrides,
    })
  }

  const handlePriceChange = ({ priceMin, priceMax }) => {
    emit({ priceMin, priceMax })
  }

  const toggleCompany = (id) => {
    const next = filters.companies.includes(id)
      ? filters.companies.filter((c) => c !== id)
      : [...filters.companies, id]
    emit({ companies: next })
  }

  const toggleSeatType = (value) => {
    const next = filters.seatTypes.includes(value)
      ? filters.seatTypes.filter((s) => s !== value)
      : [...filters.seatTypes, value]
    emit({ seatTypes: next })
  }

  const toggleShift = (value) => {
    const next = filters.shifts.includes(value)
      ? filters.shifts.filter((s) => s !== value)
      : [...filters.shifts, value]
    emit({ shifts: next })
  }

  const handleClear = () => {
    if (typeof onClear === 'function') onClear()
  }

  return (
    <aside className="bg-white rounded-2xl shadow-card p-6 flex flex-col gap-6 h-fit">
      <div className="flex flex-col gap-3 pb-5 border-b border-neutral-100">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
          <Search className="w-3.5 h-3.5" />
          <span>Modificar búsqueda</span>
        </div>
        <Autocomplete
          label="Origen"
          value={values.origin}
          excludeId={values.destination}
          placeholder="Ciudad de salida"
          onChange={(id) => onChange('origin', id)}
        />
        <Autocomplete
          label="Destino"
          value={values.destination}
          excludeId={values.origin}
          placeholder="Ciudad de destino"
          onChange={(id) => onChange('destination', id)}
        />
      </div>

      <FilterGroup
        title="Filtros"
        action={
          <button
            type="button"
            onClick={handleClear}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            Limpiar
          </button>
        }
      >
        <div className="flex flex-col gap-4 pt-1">
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-neutral-500">Precio</p>
            <PriceRange
              priceMin={filters.priceMin}
              priceMax={filters.priceMax}
              min={PRICE_MIN_BOUND}
              max={PRICE_MAX_BOUND}
              onChange={handlePriceChange}
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-neutral-500">Empresa</p>
            <div className="flex flex-col gap-2">
              {AGENCIES.map((agency) => (
                <Checkbox
                  key={agency.id_agencia}
                  label={agency.nombre}
                  checked={filters.companies.includes(agency.id_agencia)}
                  onChange={() => toggleCompany(agency.id_agencia)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-neutral-500">
              Tipo de Asiento
            </p>
            <div className="flex flex-col gap-2">
              {SEAT_TYPES.map((seat) => (
                <Checkbox
                  key={seat}
                  label={seat}
                  checked={filters.seatTypes.includes(seat)}
                  onChange={() => toggleSeatType(seat)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-neutral-500">Turno</p>
            <div className="flex flex-col gap-2">
              {SHIFTS.map((shift) => (
                <Checkbox
                  key={shift}
                  label={shift}
                  checked={filters.shifts.includes(shift)}
                  onChange={() => toggleShift(shift)}
                />
              ))}
            </div>
          </div>
        </div>
      </FilterGroup>
    </aside>
  )
}
