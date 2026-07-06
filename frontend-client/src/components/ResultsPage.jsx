import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { ArrowLeft, Search as SearchIcon } from 'lucide-react'
import Navbar from './Navbar'
import BottomNav from './BottomNav'
import FilterSidebar from './FilterSidebar'
import BusCardDesktop from './BusCardDesktop'
import BusCardMobile from './BusCardMobile'
import ResultsMobileHeader from './ResultsMobileHeader'
import SeatSelectionPage from './SeatSelectionPage'
import CheckoutPage from './CheckoutPage'
import ConfirmationPage from './ConfirmationPage'
import Alert from './Alert'
import { searchTravelsRequest } from '../api/travels'
import { getTerminalById, resolveTerminalId } from '../data/terminales'
import {
  PRICE_RANGE,
  TIPO_SERVICIO_FROM_BACKEND,
  TIPO_SERVICIO_TO_BACKEND,
  TURNO_FROM_BACKEND,
  TURNO_TO_BACKEND,
} from '../data/agencies'

const FALLBACK_ORIGIN = 'Lima'
const FALLBACK_DESTINATION = 'Trujillo'
const FALLBACK_DATE = '2026-06-15'
const FALLBACK_PASSENGERS = '1'

// PERFORMANCE: hook de debounce para objetos. Compara el JSON del
// objeto en cada render; si no cambia tras `delay` ms, lo publica.
// Usado para que el usuario pueda mover sliders / toggles de filtro
// sin disparar un GET por cada movimiento.
function useDebouncedFilters(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [JSON.stringify(value), delay])
  return debounced
}

function ResultsSkeleton({ count = 4 }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando resultados">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={`skeleton-${i}`}
          className="border border-neutral-200 rounded-xl p-4 bg-white shadow-sm animate-pulse flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="w-4 h-4 rounded-full bg-neutral-200" />
            <div className="flex flex-col gap-2 min-w-0 flex-1">
              <div className="h-3 w-32 bg-neutral-200 rounded" />
              <div className="h-3 w-48 bg-neutral-100 rounded" />
            </div>
          </div>
          <div className="hidden md:flex flex-col items-end gap-2 shrink-0">
            <div className="h-4 w-24 bg-neutral-200 rounded" />
            <div className="h-3 w-16 bg-neutral-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ onBack }) {
  return (
    <div className="bg-white border border-neutral-100 rounded-2xl p-8 text-center flex flex-col items-center gap-3">
      <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-6 h-6"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-neutral-900">
        No encontramos buses para esta ruta y fecha
      </h3>
      <p className="text-sm text-neutral-600 max-w-sm">
        Prueba modificando el origen, el destino o la fecha de salida desde el
        formulario de búsqueda.
      </p>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a la búsqueda
        </button>
      )}
    </div>
  )
}

function MissingSearchState({ onBack }) {
  return (
    <div className="bg-white border border-neutral-100 rounded-2xl p-8 text-center flex flex-col items-center gap-3">
      <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
        <SearchIcon className="w-6 h-6" />
      </div>
      <h3 className="text-base font-semibold text-neutral-900">
        Selecciona origen, destino y fecha
      </h3>
      <p className="text-sm text-neutral-600 max-w-sm">
        Para ver los buses disponibles necesitamos que completes los datos de
        tu viaje desde el formulario de búsqueda.
      </p>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Ir al formulario de búsqueda
        </button>
      )}
    </div>
  )
}

function readValues(searchParams) {
  const origen = searchParams.get('origen') || ''
  const destino = searchParams.get('destino') || ''
  const fecha = searchParams.get('fecha') || ''
  const pasajeros = searchParams.get('pasajeros') || FALLBACK_PASSENGERS
  return { origin: origen, destination: destino, date: fecha, passengers: pasajeros }
}

function readFilters(searchParams) {
  const precioMinRaw = searchParams.get('precio_min')
  const precioMaxRaw = searchParams.get('precio_max')
  const precioMin = precioMinRaw !== null ? Number(precioMinRaw) : PRICE_RANGE.min
  const precioMax = precioMaxRaw !== null ? Number(precioMaxRaw) : PRICE_RANGE.max

  const agencias = (searchParams.get('agencias') || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)

  const tipoBackend = (searchParams.get('tipo_servicio') || '').toLowerCase()
  const seatTypes = tipoBackend && TIPO_SERVICIO_FROM_BACKEND[tipoBackend]
    ? [TIPO_SERVICIO_FROM_BACKEND[tipoBackend]]
    : []

  const turnoBackend = (searchParams.get('turno') || '').toLowerCase()
  const shifts = turnoBackend && TURNO_FROM_BACKEND[turnoBackend]
    ? [TURNO_FROM_BACKEND[turnoBackend]]
    : []

  return {
    priceMin: Number.isFinite(precioMin) ? precioMin : PRICE_RANGE.min,
    priceMax: Number.isFinite(precioMax) ? precioMax : PRICE_RANGE.max,
    companies: agencias,
    seatTypes,
    shifts,
  }
}

function describeTerminal(value, fallbackCity) {
  const id = resolveTerminalId(value)
  if (!id) return fallbackCity
  return getTerminalById(id)?.ciudad || fallbackCity
}

function buildSearchParams(values, filters) {
  const params = new URLSearchParams()
  if (values.origin) params.set('origen', String(values.origin))
  if (values.destination) params.set('destino', String(values.destination))
  if (values.date) params.set('fecha', values.date)
  if (values.passengers) params.set('pasajeros', String(values.passengers))

  const f = filters || {}
  const isDefaultPrice =
    f.priceMin === PRICE_RANGE.min && f.priceMax === PRICE_RANGE.max

  if (!isDefaultPrice) {
    if (Number.isFinite(f.priceMin)) params.set('precio_min', String(f.priceMin))
    if (Number.isFinite(f.priceMax)) params.set('precio_max', String(f.priceMax))
  }
  if (Array.isArray(f.companies) && f.companies.length > 0) {
    params.set('agencias', f.companies.join(','))
  }
  const tipo = (f.seatTypes || [])
    .map((s) => TIPO_SERVICIO_TO_BACKEND[s])
    .filter(Boolean)[0]
  if (tipo) params.set('tipo_servicio', tipo)
  const turno = (f.shifts || [])
    .map((s) => TURNO_TO_BACKEND[s])
    .filter(Boolean)[0]
  if (turno) params.set('turno', turno)

  return params
}

export default function ResultsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const values = useMemo(() => readValues(searchParams), [searchParams])
  const filters = useMemo(() => readFilters(searchParams), [searchParams])

  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [currentScreen, setCurrentScreen] = useState('results')
  const [selectedTrip, setSelectedTrip] = useState(null)
  const [checkoutData, setCheckoutData] = useState(null)
  const [paymentData, setPaymentData] = useState(null)
  const [selectedTripId, setSelectedTripId] = useState(null)
  const requestIdRef = useRef(0)

  // PERFORMANCE: debounce de los filtros. El usuario suele mover
  // sliders / toggles rapidamente; sin debounce, cada movimiento
  // dispara un GET al backend. 300ms es suficiente para que el
  // usuario "termine" de ajustar y reduce el trafico al backend
  // a 1 request por rafaga de movimientos.
  const debouncedFilters = useDebouncedFilters(filters, 300)

  useEffect(() => {
    const continueFromSeats = location.state?.continueFromSeats
    if (!continueFromSeats) return

    const {
      idViaje: contViajeId,
      selectedSeatIds,
      total: contTotal,
      trip: contTrip,
    } = continueFromSeats

    if (contTrip && contTrip.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedTrip(contTrip)
    } else if (contViajeId && trips.length > 0) {
      const match = trips.find((t) => Number(t.id) === Number(contViajeId))
      if (match) {
        setSelectedTrip(match)
      }
    }

    if (Array.isArray(selectedSeatIds) && selectedSeatIds.length > 0) {
      setCheckoutData({
        idViaje: contViajeId,
        selectedSeats: selectedSeatIds,
        selectedSeatsFull: continueFromSeats.selectedSeats || [],
        total: contTotal,
      })
      setCurrentScreen('checkout')
    }

    navigate(location.pathname + location.search, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  const hasRequiredParams = Boolean(
    values.origin && values.destination && values.date,
  )

  useEffect(() => {
    if (!hasRequiredParams) {
      requestIdRef.current += 1
      // Reset state when the search params are missing.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTrips([])
      setError(null)
      setLoading(false)
      return
    }

    const idOrigen = resolveTerminalId(values.origin)
    const idDestino = resolveTerminalId(values.destination)

    if (!idOrigen || !idDestino) {
      requestIdRef.current += 1
      setTrips([])
      setError('No reconocemos el origen o destino seleccionado.')
      setLoading(false)
      return
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) {
      requestIdRef.current += 1
      setTrips([])
      setError('La fecha de salida no es válida.')
      setLoading(false)
      return
    }

    const currentRequestId = requestIdRef.current + 1
    requestIdRef.current = currentRequestId
    setLoading(true)
    setError(null)

    searchTravelsRequest({
      id_terminal_origen: idOrigen,
      id_terminal_destino: idDestino,
      fecha_salida: values.date,
      agencias: debouncedFilters.companies,
      precio_min: debouncedFilters.priceMin,
      precio_max: debouncedFilters.priceMax,
      tipo_servicio: (debouncedFilters.seatTypes || [])
        .map((s) => TIPO_SERVICIO_TO_BACKEND[s])
        .filter(Boolean)[0] || null,
      turno: (debouncedFilters.shifts || [])
        .map((s) => TURNO_TO_BACKEND[s])
        .filter(Boolean)[0] || null,
    })
      .then((results) => {
        if (requestIdRef.current !== currentRequestId) return
        setTrips(results)
      })
      .catch((err) => {
        if (requestIdRef.current !== currentRequestId) return
        const status = err?.status
        if (status === 400) {
          setError(err?.message || 'Verifica los datos de búsqueda.')
        } else if (status === 422) {
          setError(
            err?.message ||
              'Verifica los datos de búsqueda (origen, destino y fecha son obligatorios).',
          )
        } else if (status >= 500) {
          setError(
            'No pudimos consultar las rutas en este momento. Intenta nuevamente en unos minutos.',
          )
        } else {
          setError(err?.message || 'Ocurrió un error al buscar viajes.')
        }
        setTrips([])
      })
      .finally(() => {
        if (requestIdRef.current === currentRequestId) {
          setLoading(false)
        }
      })
  }, [
    hasRequiredParams,
    values.origin,
    values.destination,
    values.date,
    debouncedFilters.companies,
    debouncedFilters.priceMin,
    debouncedFilters.priceMax,
    debouncedFilters.seatTypes,
    debouncedFilters.shifts,
  ])

  const handleBackToLanding = useCallback(() => {
    navigate('/')
  }, [navigate])

  const handleFieldChange = useCallback(
    (field, value) => {
      const next = { ...values, [field]: value }
      setSearchParams(buildSearchParams(next, filters), { replace: true })
    },
    [setSearchParams, values, filters],
  )

  const handleApplyFilters = useCallback(
    (newFilters) => {
      setSearchParams(buildSearchParams(values, newFilters), { replace: true })
    },
    [setSearchParams, values],
  )

  const handleClearFilters = useCallback(() => {
    setSearchParams(buildSearchParams(values, null), { replace: true })
  }, [setSearchParams, values])

  const handleBackToResults = useCallback(() => {
    setCurrentScreen('results')
  }, [])

  const handleBackToSeats = useCallback(() => {
    setCurrentScreen('seats')
  }, [])

  const handleContinueToCheckout = useCallback((selectedSeats, total) => {
    setCheckoutData({ selectedSeats, total })
    setCurrentScreen('checkout')
  }, [])

  const handlePaymentSuccess = useCallback((data) => {
    setPaymentData(data)
    setCurrentScreen('confirmation')
  }, [])

  const handleGoHome = useCallback(() => {
    setSelectedTrip(null)
    setCheckoutData(null)
    setPaymentData(null)
    setCurrentScreen('results')
    navigate('/')
  }, [navigate])

  const handleGoToTrips = useCallback(() => {
    setSelectedTrip(null)
    setCheckoutData(null)
    setPaymentData(null)
    setCurrentScreen('results')
    navigate('/?tab=mis-viajes')
  }, [navigate])

  const handleNavigate = useCallback(
    (tab) => {
      if (tab === 'buscar') {
        setCurrentScreen('results')
        return
      }
      if (tab === 'mis-viajes') {
        navigate('/?tab=mis-viajes')
        return
      }
      if (tab === 'perfil') {
        navigate('/?tab=perfil')
        return
      }
      if (tab === 'login' || tab === 'registro' || tab === 'reclamos') {
        navigate(`/?tab=${tab}`)
      }
    },
    [navigate],
  )

  const originCity = describeTerminal(values.origin, FALLBACK_ORIGIN)
  const destinationCity = describeTerminal(values.destination, FALLBACK_DESTINATION)
  const rawDate = values.date || FALLBACK_DATE
  const passengers = values.passengers || FALLBACK_PASSENGERS

  const handleChooseSeats = useCallback(
    (trip) => {
      if (!trip?.id) return
      const idViaje = Number(trip.id)
      if (!Number.isInteger(idViaje) || idViaje <= 0) return

      const params = new URLSearchParams()
      if (values.date) params.set('fecha', values.date)
      if (values.passengers) params.set('pasajeros', String(values.passengers))
      if (originCity) params.set('origen', originCity)
      if (destinationCity) params.set('destino', destinationCity)
      if (trip.company) params.set('empresa', trip.company)
      if (trip.departureTime) params.set('hora', trip.departureTime)
      if (Number.isFinite(trip.priceFrom)) {
        params.set('precio_base', String(trip.priceFrom))
      }

      const query = params.toString()
      navigate(`/viaje/${idViaje}/asientos${query ? `?${query}` : ''}`, {
        state: {
          trip,
          searchValues: values,
          origin: originCity,
          destination: destinationCity,
        },
      })
    },
    [
      navigate,
      values,
      originCity,
      destinationCity,
    ],
  )

  const displayDate = useMemo(() => {
    if (!rawDate) return FALLBACK_DATE
    const match = String(rawDate).match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) return `${match[3]}/${match[2]}/${match[1]}`
    return rawDate
  }, [rawDate])

  if (currentScreen === 'seats' && selectedTrip) {
    return (
      <SeatSelectionPage
        trip={selectedTrip}
        date={values.date}
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
        date={values.date}
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
        date={values.date}
        selectedSeats={checkoutData.selectedSeats}
        passengers={paymentData.passengers}
        buyer={paymentData.buyer}
        onGoHome={handleGoHome}
        onGoToTrips={handleGoToTrips}
        onNavigate={handleNavigate}
      />
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="hidden md:block">
        <Navbar onNavigate={handleNavigate} active="buscar" />
        <div className="md:grid md:grid-cols-[300px_1fr] gap-8 p-8 max-w-7xl mx-auto">
          <FilterSidebar
            values={values}
            onChange={handleFieldChange}
            filters={filters}
            onApply={handleApplyFilters}
            onClear={handleClearFilters}
          />

          <section className="flex flex-col gap-6">
            <header className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold text-neutral-900">
                {hasRequiredParams
                  ? `Buses de ${originCity} a ${destinationCity}`
                  : 'Resultados de búsqueda'}
              </h1>
              {hasRequiredParams && (
                <p className="text-sm text-neutral-600">
                  {displayDate} · {passengers} pasajeros
                </p>
              )}
            </header>

            {error && !loading && <Alert variant="error">{error}</Alert>}

            {loading ? (
              <ResultsSkeleton />
            ) : !hasRequiredParams ? (
              <MissingSearchState onBack={handleBackToLanding} />
            ) : trips.length === 0 ? (
              <EmptyState onBack={handleBackToLanding} />
            ) : (
              <div className="flex flex-col gap-4">
                {trips.map((trip) => (
                  <BusCardDesktop
                    key={trip.id}
                    trip={trip}
                    selected={selectedTripId === trip.id}
                    onSelect={setSelectedTripId}
                    onChooseSeats={handleChooseSeats}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="block md:hidden pb-24">
        <ResultsMobileHeader
          origin={originCity}
          destination={destinationCity}
          date={displayDate}
          passengers={passengers}
          onBack={handleBackToLanding}
        />
        <main className="flex flex-col gap-4 p-4">
          {error && !loading && <Alert variant="error">{error}</Alert>}

          {loading ? (
            <ResultsSkeleton count={3} />
          ) : !hasRequiredParams ? (
            <MissingSearchState onBack={handleBackToLanding} />
          ) : trips.length === 0 ? (
            <EmptyState onBack={handleBackToLanding} />
          ) : (
            trips.map((trip) => (
              <BusCardMobile
                key={trip.id}
                trip={trip}
                selected={selectedTripId === trip.id}
                onSelect={setSelectedTripId}
                onChooseSeats={handleChooseSeats}
              />
            ))
          )}
        </main>
        <BottomNav active="buscar" onNavigate={handleNavigate} />
      </div>
    </div>
  )
}
