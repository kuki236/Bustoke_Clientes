import { useState } from 'react'
import Navbar from './Navbar'
import MobileHeader from './MobileHeader'
import Hero from './Hero'
import MobileSearchCard from './MobileSearchCard'
import DestinationCarousel from './DestinationCarousel'
import BottomNav from './BottomNav'
import ResultsPage from './ResultsPage'
import SeatSelectionPage from './SeatSelectionPage'
import CheckoutPage from './CheckoutPage'

const INITIAL_SEARCH = {
  origin: '',
  destination: '',
  date: '',
  passengers: '1',
}

export default function LandingPage() {
  const [search, setSearch] = useState(INITIAL_SEARCH)
  const [currentScreen, setCurrentScreen] = useState('landing')
  const [selectedTrip, setSelectedTrip] = useState(null)
  const [checkoutData, setCheckoutData] = useState(null)

  const handleChange = (field, value) => {
    setSearch((prev) => ({ ...prev, [field]: value }))
  }

  const handleSearch = () => {
    setCurrentScreen('results')
  }

  const handleBackToLanding = () => {
    setCurrentScreen('landing')
  }

  const handleBackToResults = () => {
    setCurrentScreen('results')
  }

  const handleBackToSeats = () => {
    setCurrentScreen('seats')
  }

  const handleChooseSeats = (trip) => {
    setSelectedTrip(trip)
    setCurrentScreen('seats')
  }

  const handleContinueToCheckout = (selectedSeats, total) => {
    setCheckoutData({ selectedSeats, total })
    setCurrentScreen('checkout')
  }

  if (currentScreen === 'results') {
    return (
      <ResultsPage
        values={search}
        onBack={handleBackToLanding}
        onChooseSeats={handleChooseSeats}
      />
    )
  }

  if (currentScreen === 'seats' && selectedTrip) {
    return (
      <SeatSelectionPage
        trip={selectedTrip}
        date={search.date}
        onBack={handleBackToResults}
        onContinue={handleContinueToCheckout}
      />
    )
  }

  if (currentScreen === 'checkout' && selectedTrip && checkoutData) {
    return (
      <CheckoutPage
        trip={selectedTrip}
        selectedSeats={checkoutData.selectedSeats}
        total={checkoutData.total}
        date={search.date}
        onBack={handleBackToSeats}
      />
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="hidden md:block">
        <Navbar />
        <Hero values={search} onChange={handleChange} onSearch={handleSearch} />
      </div>

      <div className="block md:hidden pb-24">
        <MobileHeader />
        <main className="px-4 -mt-24">
          <MobileSearchCard
            values={search}
            onChange={handleChange}
            onSearch={handleSearch}
          />
          <section className="mt-8">
            <h2 className="text-neutral-900 font-semibold text-lg mb-4">
              Descubre tu próximo destino
            </h2>
            <DestinationCarousel />
          </section>
        </main>
        <BottomNav active="search" />
      </div>
    </div>
  )
}
