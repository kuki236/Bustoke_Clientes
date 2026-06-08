import Autocomplete from './Autocomplete'
import PassengerStepper from './PassengerStepper'
import SearchField from './SearchField'

export default function SearchBar({ values, onChange, onSearch, isSearching = false }) {
  const handleSubmit = (event) => {
    event.preventDefault()
    onSearch?.()
  }

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
        onChange={(v) => onChange('date', v)}
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
