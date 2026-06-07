import { useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import Navbar from './Navbar'
import BottomNav from './BottomNav'
import FilterSidebar from './FilterSidebar'
import BusCardDesktop from './BusCardDesktop'
import BusCardMobile from './BusCardMobile'
import ResultsMobileHeader from './ResultsMobileHeader'
import { MOCK_TRIPS } from '../data/mockTrips'

const DEFAULT_ORIGIN = 'Lima'
const DEFAULT_DESTINATION = 'Trujillo'
const DEFAULT_DATE = '15/06/2026'

export default function ResultsPage({ values, onBack, onChooseSeats }) {
  const [draftValues, setDraftValues] = useState(values)
  const [selectedTripId, setSelectedTripId] = useState(null)

  const origin = draftValues.origin || DEFAULT_ORIGIN
  const destination = draftValues.destination || DEFAULT_DESTINATION
  const date = draftValues.date || DEFAULT_DATE
  const passengers = draftValues.passengers || '1'

  const handleFieldChange = (field, value) => {
    setDraftValues((prev) => ({ ...prev, [field]: value }))
  }

  const trips = useMemo(() => MOCK_TRIPS, [])

  const handleSelect = (id) => {
    setSelectedTripId(id)
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="hidden md:block">
        <Navbar />
        <div className="md:grid md:grid-cols-[300px_1fr] gap-8 p-8 max-w-7xl mx-auto">
          <FilterSidebar values={draftValues} onChange={handleFieldChange} />

          <section className="flex flex-col gap-6">
            <header className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold text-neutral-900">
                Buses de {origin} a {destination}
              </h1>
              <p className="text-sm text-neutral-600">
                {date} · {passengers} pasajeros
              </p>
            </header>

            <div className="flex flex-col gap-4">
              {trips.map((trip) => (
                <BusCardDesktop
                  key={trip.id}
                  trip={trip}
                  selected={selectedTripId === trip.id}
                  onSelect={handleSelect}
                  onChooseSeats={onChooseSeats}
                />
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="block md:hidden pb-24">
        <ResultsMobileHeader
          origin={origin}
          destination={destination}
          date={date}
          passengers={passengers}
        />
        <main className="flex flex-col gap-4 p-4">
          {trips.map((trip) => (
            <BusCardMobile
              key={trip.id}
              trip={trip}
              selected={selectedTripId === trip.id}
              onSelect={handleSelect}
              onChooseSeats={onChooseSeats}
            />
          ))}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mt-2 flex items-center justify-center gap-2 text-sm font-medium text-neutral-600 py-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver a la búsqueda
            </button>
          )}
        </main>
        <BottomNav active="search" />
      </div>
    </div>
  )
}
