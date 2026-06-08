import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from './Navbar'
import MobileHeader from './MobileHeader'
import Hero from './Hero'
import MobileSearchCard from './MobileSearchCard'
import DestinationCarousel from './DestinationCarousel'
import BottomNav from './BottomNav'
import LoginPage from './LoginPage'
import RegisterPage from './RegisterPage'
import HistoryPage from './HistoryPage'
import ProfilePage from './ProfilePage'
import ClaimsPage from './ClaimsPage'

const INITIAL_SEARCH = {
  origin: '',
  destination: '',
  date: '',
  passengers: '1',
}

const VALID_TABS = new Set([
  'buscar',
  'login',
  'registro',
  'mis-viajes',
  'perfil',
  'reclamos',
])

export default function LandingPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab')
  const [search, setSearch] = useState(INITIAL_SEARCH)
  const [currentScreen, setCurrentScreen] = useState(
    initialTab && VALID_TABS.has(initialTab) ? initialTab : 'buscar',
  )
  const [linkedTrip, setLinkedTrip] = useState(null)

  const handleChange = (field, value) => {
    setSearch((prev) => ({ ...prev, [field]: value }))
  }

  const handleSearch = () => {
    const params = new URLSearchParams()
    if (search.origin) params.set('origen', String(search.origin))
    if (search.destination) params.set('destino', String(search.destination))
    if (search.date) params.set('fecha', search.date)
    if (search.passengers) params.set('pasajeros', String(search.passengers))
    const query = params.toString()
    navigate(`/buses${query ? `?${query}` : ''}`)
  }

  const handleBackToLanding = () => {
    setCurrentScreen('buscar')
  }

  const handleGoHome = () => {
    setCurrentScreen('buscar')
  }

  const handleNavigate = (tab) => {
    if (!VALID_TABS.has(tab)) return
    setCurrentScreen(tab)
    const next = new URLSearchParams(searchParams)
    if (tab === 'buscar') {
      next.delete('tab')
    } else {
      next.set('tab', tab)
    }
    setSearchParams(next, { replace: true })
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
