import { useState } from 'react'
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-neutral-600">
        <span>
          S/ <span className="font-semibold text-neutral-900">{priceMin}</span>
        </span>
        <span>
          S/ <span className="font-semibold text-neutral-900">{priceMax}</span>
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
      <div className="flex justify-between text-[10px] text-neutral-500">
        <span>S/ {min}</span>
        <span>S/ {max}</span>
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
  isApplying = false,
}) {
  const PRICE_MIN_BOUND = PRICE_RANGE.min
  const PRICE_MAX_BOUND = PRICE_RANGE.max

  const [priceMin, setPriceMin] = useState(filters.priceMin)
  const [priceMax, setPriceMax] = useState(filters.priceMax)
  const [companies, setCompanies] = useState(filters.companies)
  const [seatTypes, setSeatTypes] = useState(filters.seatTypes)
  const [shifts, setShifts] = useState(filters.shifts)
  const [lastSeenFilters, setLastSeenFilters] = useState(filters)

  // Patrón recomendado por React para sincronizar estado local con
  // props externos: si los filtros cambiaron desde fuera
  // (Apply / Clear / navegación), actualizamos el estado local
  // durante el render sin disparar un useEffect.
  // Ref: https://react.dev/reference/react/useState#storing-information-from-previous-renders
  if (
    filters.priceMin !== lastSeenFilters.priceMin ||
    filters.priceMax !== lastSeenFilters.priceMax ||
    filters.companies !== lastSeenFilters.companies ||
    filters.seatTypes !== lastSeenFilters.seatTypes ||
    filters.shifts !== lastSeenFilters.shifts
  ) {
    setLastSeenFilters(filters)
    setPriceMin(filters.priceMin)
    setPriceMax(filters.priceMax)
    setCompanies(filters.companies)
    setSeatTypes(filters.seatTypes)
    setShifts(filters.shifts)
  }

  const toggle = (list, setList, value) => {
    setList(
      list.includes(value)
        ? list.filter((item) => item !== value)
        : [...list, value],
    )
  }

  const handleClearLocal = () => {
    setPriceMin(PRICE_MIN_BOUND)
    setPriceMax(PRICE_MAX_BOUND)
    setCompanies([])
    setSeatTypes([])
    setShifts([])
  }

  const handleApply = () => {
    if (typeof onApply === 'function') {
      onApply({
        priceMin,
        priceMax,
        companies,
        seatTypes,
        shifts,
      })
    }
  }

  const handleClear = () => {
    handleClearLocal()
    if (typeof onClear === 'function') {
      onClear()
    }
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
            disabled={isApplying}
          >
            Limpiar
          </button>
        }
      >
        <div className="flex flex-col gap-4 pt-1">
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-neutral-500">Precio</p>
            <PriceRange
              priceMin={priceMin}
              priceMax={priceMax}
              min={PRICE_MIN_BOUND}
              max={PRICE_MAX_BOUND}
              onChange={({ priceMin: nMin, priceMax: nMax }) => {
                setPriceMin(nMin)
                setPriceMax(nMax)
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-neutral-500">Empresa</p>
            <div className="flex flex-col gap-2">
              {AGENCIES.map((agency) => (
                <Checkbox
                  key={agency.id_agencia}
                  label={agency.nombre}
                  checked={companies.includes(agency.id_agencia)}
                  onChange={() =>
                    toggle(companies, setCompanies, agency.id_agencia)
                  }
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
                  checked={seatTypes.includes(seat)}
                  onChange={() => toggle(seatTypes, setSeatTypes, seat)}
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
                  checked={shifts.includes(shift)}
                  onChange={() => toggle(shifts, setShifts, shift)}
                />
              ))}
            </div>
          </div>
        </div>
      </FilterGroup>

      <button
        type="button"
        onClick={handleApply}
        disabled={isApplying}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 text-white text-sm font-semibold py-2.5 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {isApplying ? 'Aplicando…' : 'Aplicar Filtros'}
      </button>
    </aside>
  )
}
