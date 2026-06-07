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
import ConfirmationPage from './ConfirmationPage'
import HistoryPage from './HistoryPage'
import ProfilePage from './ProfilePage'
import LoginPage from './LoginPage'
import RegisterPage from './RegisterPage'
import ClaimsPage from './ClaimsPage'

const INITIAL_SEARCH = {
  origin: '',
  destination: '',
  date: '',
  passengers: '1',
}

export default function LandingPage() {
  const [search, setSearch] = useState(INITIAL_SEARCH)
  const [currentScreen, setCurrentScreen] = useState('buscar')
  const [selectedTrip, setSelectedTrip] = useState(null)
  const [checkoutData, setCheckoutData] = useState(null)
  const [paymentData, setPaymentData] = useState(null)
  const [linkedTrip, setLinkedTrip] = useState(null)

  const handleChange = (field, value) => {
    setSearch((prev) => ({ ...prev, [field]: value }))
  }

  const handleSearch = () => {
    setCurrentScreen('results')
  }

  const handleBackToLanding = () => {
    setCurrentScreen('buscar')
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

  const handlePaymentSuccess = (data) => {
    setPaymentData(data)
    setCurrentScreen('confirmation')
  }

  const resetPurchaseFlow = () => {
    setSelectedTrip(null)
    setCheckoutData(null)
    setPaymentData(null)
    setSearch(INITIAL_SEARCH)
  }

  const handleGoHome = () => {
    resetPurchaseFlow()
    setCurrentScreen('buscar')
  }

  const handleGoToTrips = () => {
    resetPurchaseFlow()
    setCurrentScreen('mis-viajes')
  }

  const handleNavigate = (tab) => {
    if (tab === 'login' || tab === 'registro') {
      setCurrentScreen(tab)
      return
    }
    if (tab === 'buscar') {
      resetPurchaseFlow()
      setCurrentScreen('buscar')
      return
    }
    if (tab === 'mis-viajes' || tab === 'perfil') {
      resetPurchaseFlow()
      setCurrentScreen(tab)
    }
    if (tab === 'reclamos') {
      setCurrentScreen('reclamos')
    }
  }

  const handleReportIssue = (trip) => {
    setLinkedTrip(trip ?? null)
    setCurrentScreen('reclamos')
  }

  const handleChangeAuthMode = (mode) => {
    setCurrentScreen(mode)
  }

  if (currentScreen === 'login') {
    return (
      <LoginPage
        onChangeMode={handleChangeAuthMode}
        onBack={handleBackToLanding}
      />
    )
  }

  if (currentScreen === 'registro') {
    return (
      <RegisterPage
        onChangeMode={handleChangeAuthMode}
        onBack={handleBackToLanding}
      />
    )
  }

  if (currentScreen === 'results') {
    return (
      <ResultsPage
        values={search}
        onBack={handleBackToLanding}
        onChooseSeats={handleChooseSeats}
        onNavigate={handleNavigate}
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
        onNavigate={handleNavigate}
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
        onPaymentSuccess={handlePaymentSuccess}
        onNavigate={handleNavigate}
      />
    )
  }

  if (
    currentScreen === 'confirmation' &&
    selectedTrip &&
    checkoutData &&
    paymentData
  ) {
    return (
      <ConfirmationPage
        trip={selectedTrip}
        date={search.date}
        selectedSeats={checkoutData.selectedSeats}
        passengers={paymentData.passengers}
        buyer={paymentData.buyer}
        onGoHome={handleGoHome}
        onGoToTrips={handleGoToTrips}
        onNavigate={handleNavigate}
      />
    )
  }

  if (currentScreen === 'mis-viajes') {
    return (
      <HistoryPage
        onNavigate={handleNavigate}
        onReportIssue={handleReportIssue}
      />
    )
  }

  if (currentScreen === 'perfil') {
    return <ProfilePage onNavigate={handleNavigate} onBack={handleGoHome} />
  }

  if (currentScreen === 'reclamos') {
    return (
      <ClaimsPage
        onNavigate={handleNavigate}
        onBack={handleBackToLanding}
        linkedTrip={linkedTrip}
      />
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="hidden md:block">
        <Navbar onNavigate={handleNavigate} active="buscar" />
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
        <BottomNav active="buscar" onNavigate={handleNavigate} />
      </div>
    </div>
  )
}
