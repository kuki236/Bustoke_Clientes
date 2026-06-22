import Autocomplete from './Autocomplete'
import PassengerStepper from './PassengerStepper'
import SearchField from './SearchField'

// FIX BUG-028: helper para obtener la fecha de hoy en formato
// `YYYY-MM-DD` (el que requiere el input type="date" como min/max).
// Se calcula en el render (no en useState) para que siempre use
// la fecha actual del dispositivo del usuario, no la del mount inicial.
function todayIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// FIX BUG-029: limitamos la fecha máxima de búsqueda a 90 días
// hacia adelante para evitar fechas absurdas (2030, etc.) y mantener
// consistencia con la ventana operativa real de las agencias.
const MAX_SEARCH_DAYS = 90
function maxDateIso() {
  const d = new Date()
  d.setDate(d.getDate() + MAX_SEARCH_DAYS)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function SearchBar({ values, onChange, onSearch, isSearching = false }) {
  const handleSubmit = (event) => {
    event.preventDefault()
    onSearch?.()
  }

  const minDate = todayIso()
  const maxDate = maxDateIso()

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl shadow-card p-4 lg:p-5 flex flex-row items-center gap-4 lg:gap-6 w-full max-w-6xl mx-auto"
    >
      <Autocomplete
        label="Origen"
        value={values.origin}
        excludeId={values.destination}
        placeholder="Ciudad de salida"
        onChange={(id) => onChange('origin', id)}
      />
      <div className="hidden lg:block w-px h-10 bg-neutral-200" />
      <Autocomplete
        label="Destino"
        value={values.destination}
        excludeId={values.origin}
        placeholder="Ciudad de destino"
        onChange={(id) => onChange('destination', id)}
      />
      <div className="hidden lg:block w-px h-10 bg-neutral-200" />
      <SearchField
        label="Fecha de Salida"
        type="date"
        value={values.date}
        placeholder="DD/MM/AAAA"
        min={minDate}
        max={maxDate}
        onChange={(v) => {
          // FIX BUG-028: clamp defensivo en frontend. Aunque el
          // navegador respeta `min`/`max`, en algunos navegadores
          // móviles el picker permite tipear la fecha manualmente
          // y saltar la restricción. Si llega una fecha fuera de
          // rango, la corregimos al límite correspondiente.
          if (v && v < minDate) v = minDate
          if (v && v > maxDate) v = maxDate
          onChange('date', v)
        }}
      />
      <div className="hidden lg:block w-px h-10 bg-neutral-200" />
      <PassengerStepper
        label="Pasajeros"
        value={values.passengers}
        onChange={(v) => onChange('passengers', v)}
      />
      <button
        type="submit"
        disabled={isSearching}
        className={`font-semibold px-6 py-3 rounded-xl transition-colors shrink-0 ${
          isSearching
            ? 'bg-blue-600/70 text-white cursor-wait'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
      >
        {isSearching ? 'Buscando…' : 'Buscar Buses'}
      </button>
    </form>
  )
}
