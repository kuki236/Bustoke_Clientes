import Autocomplete from './Autocomplete'
import PassengerStepper from './PassengerStepper'
import SearchField from './SearchField'

export default function MobileSearchCard({ values, onChange, onSearch, isSearching = false }) {
  const handleSubmit = (event) => {
    event.preventDefault()
    onSearch?.()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-4 w-full"
    >
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
      <SearchField
        label="Fecha de Salida"
        type="date"
        value={values.date}
        placeholder="DD/MM/AAAA"
        onChange={(v) => onChange('date', v)}
      />
      <PassengerStepper
        label="Pasajeros"
        value={values.passengers}
        onChange={(v) => onChange('passengers', v)}
      />
      <button
        type="submit"
        disabled={isSearching}
        className={`font-semibold py-3 rounded-xl w-full transition-colors ${
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
