import SearchField from './SearchField'

export default function SearchBar({ values, onChange, onSearch }) {
  const handleSubmit = (e) => {
    e.preventDefault()
    onSearch?.()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl shadow-card p-4 lg:p-5 flex flex-row items-center gap-4 lg:gap-6 w-full max-w-6xl mx-auto"
    >
      <SearchField
        label="Origen"
        value={values.origin}
        placeholder="Ciudad de salida"
        onChange={(v) => onChange('origin', v)}
      />
      <div className="hidden lg:block w-px h-10 bg-neutral-200" />
      <SearchField
        label="Destino"
        value={values.destination}
        placeholder="Ciudad de destino"
        onChange={(v) => onChange('destination', v)}
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
      <SearchField
        label="Pasajeros"
        type="number"
        value={values.passengers}
        options={['1', '2', '3', '4', '5+']}
        onChange={(v) => onChange('passengers', v)}
      />
      <button
        type="submit"
        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors shrink-0"
      >
        Buscar Buses
      </button>
    </form>
  )
}
