import SearchField from './SearchField'

export default function MobileSearchCard({ values, onChange, onSearch }) {
  const handleSubmit = (e) => {
    e.preventDefault()
    onSearch?.()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-4 w-full"
    >
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
      <SearchField
        label="Fecha de Salida"
        type="date"
        value={values.date}
        placeholder="DD/MM/AAAA"
        onChange={(v) => onChange('date', v)}
      />
      <SearchField
        label="Pasajeros"
        type="number"
        value={values.passengers}
        options={['1', '2', '3', '4', '5+']}
        onChange={(v) => onChange('passengers', v)}
      />
      <button
        type="submit"
        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl w-full transition-colors"
      >
        Buscar Buses
      </button>
    </form>
  )
}
