import { useState } from 'react'
import { Search } from 'lucide-react'
import SearchField from './SearchField'
import {
  AGENCIES,
  SEAT_TYPES,
  SHIFTS,
  PRICE_RANGE,
} from '../data/mockTrips'

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

export default function FilterSidebar({ values, onChange }) {
  const [selectedCompanies, setSelectedCompanies] = useState([])
  const [selectedSeats, setSelectedSeats] = useState([])
  const [selectedShifts, setSelectedShifts] = useState([])

  const toggle = (list, setList, value) => {
    setList(
      list.includes(value)
        ? list.filter((item) => item !== value)
        : [...list, value],
    )
  }

  const clearAll = () => {
    setSelectedCompanies([])
    setSelectedSeats([])
    setSelectedShifts([])
  }

  return (
    <aside className="bg-white rounded-2xl shadow-card p-6 flex flex-col gap-6 h-fit">
      <div className="flex flex-col gap-3 pb-5 border-b border-neutral-100">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
          <Search className="w-3.5 h-3.5" />
          <span>Modificar búsqueda</span>
        </div>
        <SearchField
          label="Origen"
          value={values.origin}
          placeholder="Ciudad de salida"
          onChange={(v) => onChange('origin', v)}
        />
        <SearchField
          label="Destino"
          value={values.destination}
          placeholder="Ciudad de destino"
          onChange={(v) => onChange('destination', v)}
        />
      </div>

      <FilterGroup
        title="Filtros"
        action={
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            Limpiar
          </button>
        }
      >
        <div className="flex flex-col gap-4 pt-1">
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-neutral-500">
              Precio (S/ {PRICE_RANGE.min} - {PRICE_RANGE.max})
            </p>
            <div className="relative h-6 flex items-center">
              <div className="absolute inset-x-0 h-1 bg-neutral-200 rounded-full" />
              <div className="absolute left-[15%] right-[20%] h-1 bg-blue-600 rounded-full" />
              <div className="absolute left-[15%] -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-blue-600 shadow" />
              <div className="absolute right-[20%] translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-blue-600 shadow" />
            </div>
            <div className="flex justify-between text-xs text-neutral-500">
              <span>S/ {PRICE_RANGE.min}</span>
              <span>S/ {PRICE_RANGE.max}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-neutral-500">Empresa</p>
            <div className="flex flex-col gap-2">
              {AGENCIES.map((agency) => (
                <Checkbox
                  key={agency}
                  label={agency}
                  checked={selectedCompanies.includes(agency)}
                  onChange={() =>
                    toggle(selectedCompanies, setSelectedCompanies, agency)
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
                  checked={selectedSeats.includes(seat)}
                  onChange={() =>
                    toggle(selectedSeats, setSelectedSeats, seat)
                  }
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
                  checked={selectedShifts.includes(shift)}
                  onChange={() =>
                    toggle(selectedShifts, setSelectedShifts, shift)
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </FilterGroup>
    </aside>
  )
}
