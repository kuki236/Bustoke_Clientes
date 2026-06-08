import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Star, ArrowUp, Bath } from 'lucide-react'
import Navbar from './Navbar'
import BottomNav from './BottomNav'
import Alert from './Alert'
import {
  fetchSeatMapRequest,
  holdSeatRequest,
  releaseSeatRequest,
  SEAT_STATUS,
} from '../api/seats'

const FLOOR_LABELS = {
  1: 'Primer Piso',
  2: 'Segundo Piso',
}

const SESSION_TOKEN_KEY = 'bustoke_seat_session_token'

function getSessionToken() {
  try {
    const existing = sessionStorage.getItem(SESSION_TOKEN_KEY)
    if (existing) return existing
    const next = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    sessionStorage.setItem(SESSION_TOKEN_KEY, next)
    return next
  } catch {
    return `sess-${Date.now()}`
  }
}

function SteeringWheel({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 14V8" />
      <path d="m9 11 -3.5 -2" />
      <path d="m15 11 3.5 -2" />
    </svg>
  )
}

function cleanSeatLabel(numeroAsiento) {
  const value = String(numeroAsiento || '')
  const dashIndex = value.indexOf('-')
  return dashIndex > 0 ? value.slice(0, dashIndex) : value
}

function normalizeServiceType(tipoServicio) {
  const value = String(tipoServicio || '').trim()
  if (!value) return ''
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function resolveServiceTypeForFloor(seats) {
  if (!Array.isArray(seats) || seats.length === 0) return ''
  return normalizeServiceType(seats[0].tipoServicio)
}

function resolveFloorTitle(floor, seats) {
  const baseLabel = FLOOR_LABELS[floor] || `Piso ${floor}`
  const serviceType = resolveServiceTypeForFloor(seats)
  return serviceType ? `${baseLabel} (${serviceType})` : baseLabel
}

const SEAT_BASE_CLASSES =
  'absolute w-10 h-10 text-xs font-semibold rounded-lg flex flex-col items-center justify-center transition-all'

function getSeatButtonClasses({ selected, estado, busy }) {
  if (selected) {
    return 'bg-blue-600 border-2 border-blue-600 text-white'
  }
  if (estado === SEAT_STATUS.OCCUPIED) {
    return 'bg-red-600 border-2 border-red-600 text-white cursor-not-allowed'
  }
  if (estado === SEAT_STATUS.HELD) {
    return 'bg-neutral-200 border-2 border-neutral-200 text-neutral-400 cursor-not-allowed'
  }
  if (busy) {
    return 'bg-white border-2 border-blue-600 text-blue-600 opacity-60 cursor-wait'
  }
  return 'bg-white border-2 border-blue-600 text-blue-600 hover:bg-blue-50'
}

function SeatButton({ label, isVip, selected, estado, busy, onToggle, style }) {
  const isOccupied = estado === SEAT_STATUS.OCCUPIED
  const isHeldByOther = estado === SEAT_STATUS.HELD && !selected
  const disabled = isOccupied || isHeldByOther || busy
  const ariaLabel = isOccupied
    ? `Asiento ${label} ocupado`
    : isHeldByOther
      ? `Asiento ${label} bloqueado`
      : selected
        ? `Asiento ${label} seleccionado`
        : `Asiento ${label} libre`

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      aria-disabled={disabled}
      aria-label={ariaLabel}
      style={style}
      className={`${SEAT_BASE_CLASSES} ${getSeatButtonClasses({ selected, estado, busy })}`}
    >
      {isVip && !isOccupied && !isHeldByOther && (
        <Star
          className={`w-2.5 h-2.5 mb-px ${
            selected
              ? 'fill-white text-white'
              : 'fill-orange-300 text-orange-300'
          }`}
          strokeWidth={0}
        />
      )}
      <span>{label}</span>
    </button>
  )
}

function BusLayout({ seats, floor, selectedIds, busyIds, onToggle }) {
  if (seats.length === 0) {
    return (
      <div className="relative w-[340px] h-[560px] bg-white rounded-3xl border border-neutral-200 pt-14 pb-14 px-6 mx-auto shadow-sm overflow-hidden flex items-center justify-center">
        <p className="text-sm text-neutral-500">
          No hay asientos en este piso.
        </p>
      </div>
    )
  }

  return (
    <div className="relative w-[340px] h-[560px] bg-white rounded-3xl border border-neutral-200 pt-14 pb-14 px-6 mx-auto shadow-sm overflow-hidden">
      <div
        className="absolute top-4 left-4 text-neutral-400"
        aria-label="Timón del conductor"
      >
        <SteeringWheel className="w-6 h-6" aria-hidden="true" />
      </div>

      <div
        className="absolute bottom-4 left-4 text-neutral-400"
        aria-label="Escalera de acceso"
      >
        <ArrowUp className="w-6 h-6" aria-hidden="true" />
      </div>

      <div
        className="absolute bottom-4 right-4 text-neutral-400"
        aria-label="Baño"
      >
        <Bath className="w-6 h-6" aria-hidden="true" />
      </div>

      {seats.map((seat) => {
        const label = cleanSeatLabel(seat.numeroAsiento)
        const isVip = String(seat.tipoServicio || '').toLowerCase() === 'vip'
        return (
          <SeatButton
            key={`${floor}-${seat.idAsiento}`}
            label={label}
            isVip={isVip}
            selected={selectedIds.includes(seat.idAsiento)}
            estado={seat.estado}
            busy={busyIds.includes(seat.idAsiento)}
            onToggle={() => onToggle(seat)}
            style={{
              left: `${Number(seat.coordX) || 0}%`,
              top: `${Number(seat.coordY) || 0}%`,
              transform: 'translate(-50%, -50%)',
            }}
          />
        )
      })}
    </div>
  )
}

function Legend() {
  const items = [
    { label: 'Libre', swatch: 'bg-white border-blue-600' },
    { label: 'Ocupado', swatch: 'bg-red-600 border-red-600' },
    { label: 'Bloqueado', swatch: 'bg-neutral-200 border-neutral-200' },
    { label: 'Seleccionado', swatch: 'bg-blue-600 border-blue-600' },
  ]
  return (
    <div className="flex items-center justify-center gap-6 py-4 text-xs text-neutral-600 flex-wrap">
      {items.map(({ label, swatch }) => (
        <div key={label} className="flex items-center gap-2">
          <span
            className={`w-5 h-5 rounded-md border ${swatch}`}
            aria-hidden="true"
          />
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}

function FloorTabs({ floors, activeFloor, onChange }) {
  if (floors.length <= 1) return null
  return (
    <div className="inline-flex bg-blue-700 rounded-full p-1">
      {floors.map((floor) => {
        const isActive = activeFloor === String(floor)
        return (
          <button
            key={floor}
            type="button"
            onClick={() => onChange(String(floor))}
            className={`px-5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              isActive
                ? 'bg-white text-blue-600'
                : 'bg-transparent text-white hover:bg-white/10'
            }`}
            aria-pressed={isActive}
          >
            {FLOOR_LABELS[floor] || `Piso ${floor}`}
          </button>
        )
      })}
    </div>
  )
}

function CheckoutBar({ selectedLabels, total, onContinue, dense = false }) {
  const disabled = selectedLabels.length === 0
  const label =
    selectedLabels.length === 0 ? '—' : selectedLabels.join(', ')
  return (
    <div
      className={`bg-white rounded-2xl border border-neutral-100 shadow-card ${
        dense ? 'p-4 flex flex-col gap-3' : 'p-5 flex items-center justify-between gap-4'
      }`}
    >
      <div className={dense ? '' : 'flex-1 min-w-0'}>
        <p className="text-sm text-neutral-600">
          Asientos Seleccionados:{' '}
          <span className="font-semibold text-neutral-900 break-words">
            {label}
          </span>
        </p>
        <p className="text-lg font-bold text-neutral-900 mt-1">
          Total: S/ {total.toFixed(2)}
        </p>
      </div>
      <button
        type="button"
        onClick={onContinue}
        disabled={disabled}
        className={`rounded-xl font-semibold transition-colors ${
          dense ? 'w-full py-3' : 'px-6 py-3 shrink-0'
        } ${
          disabled
            ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        Continuar a Checkout
      </button>
    </div>
  )
}

function groupSeatsByFloor(asientos) {
  const grouped = new Map()
  for (const asiento of asientos) {
    const piso = Number(asiento.piso) || 1
    if (!grouped.has(piso)) grouped.set(piso, [])
    grouped.get(piso).push({
      idAsiento: asiento.id_asiento,
      numeroAsiento: asiento.numero_asiento,
      piso,
      tipoServicio: asiento.tipo_servicio,
      coordX: Number(asiento.coord_x) || 0,
      coordY: Number(asiento.coord_y) || 0,
      estado: asiento.estado_interfaz,
      precio: Number(asiento.precio) || 0,
    })
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.coordY - b.coordY || a.coordX - b.coordX)
  }
  return grouped
}

export default function SeatSelectionPage() {
  const { id_viaje: idViajeParam } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const idViaje = Number(idViajeParam)
  const validId = Number.isInteger(idViaje) && idViaje > 0

  const routeState = location.state || {}
  const tripFromState = routeState.trip || null
  const searchValues = useMemo(
    () => routeState.searchValues || {},
    [routeState.searchValues],
  )

  const company =
    searchParams.get('empresa') ||
    tripFromState?.company ||
    'Empresa'
  const origin =
    searchParams.get('origen') ||
    routeState.origin ||
    tripFromState?.origin ||
    'Origen'
  const destination =
    searchParams.get('destino') ||
    routeState.destination ||
    tripFromState?.destination ||
    'Destino'
  const hora =
    searchParams.get('hora') ||
    tripFromState?.departureTime ||
    ''
  const fecha =
    searchParams.get('fecha') ||
    searchValues.date ||
    ''
  const precioBaseParam = searchParams.get('precio_base')
  const precioBase =
    Number(precioBaseParam) ||
    Number(tripFromState?.priceFrom) ||
    0

  const [seatMap, setSeatMap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [busyIds, setBusyIds] = useState([])
  const [activeFloor, setActiveFloor] = useState('1')
  const [actionError, setActionError] = useState(null)

  const sessionToken = useMemo(() => getSessionToken(), [])

  const loadSeatMap = useCallback(async () => {
    if (!validId) {
      setError('El identificador del viaje no es válido.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchSeatMapRequest(idViaje)
      setSeatMap(data)
      const grouped = groupSeatsByFloor(data.asientos)
      const firstFloor = Array.from(grouped.keys()).sort()[0] || 1
      setActiveFloor(String(firstFloor))
    } catch (err) {
      const status = err?.status
      if (status === 404) {
        setError('No encontramos el viaje solicitado.')
      } else if (status >= 500) {
        setError(
          'No pudimos cargar los asientos en este momento. Intenta nuevamente en unos minutos.',
        )
      } else {
        setError(err?.message || 'Ocurrió un error al cargar los asientos.')
      }
    } finally {
      setLoading(false)
    }
  }, [idViaje, validId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSeatMap()
  }, [loadSeatMap])

  useEffect(() => {
    return () => {
      const holds = selectedIds
      if (holds.length === 0) return
      holds.forEach((idAsiento) => {
        releaseSeatRequest({
          idViaje,
          idAsiento,
          tokenSesion: sessionToken,
        }).catch(() => {})
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const grouped = useMemo(() => {
    if (!seatMap) return new Map()
    return groupSeatsByFloor(seatMap.asientos)
  }, [seatMap])

  const floors = useMemo(
    () => Array.from(grouped.keys()).sort((a, b) => a - b),
    [grouped],
  )

  const selectedSeats = useMemo(() => {
    if (!seatMap) return []
    const map = new Map(seatMap.asientos.map((s) => [s.id_asiento, s]))
    return selectedIds
      .map((id) => map.get(id))
      .filter(Boolean)
  }, [seatMap, selectedIds])

  const total = useMemo(
    () => selectedSeats.reduce((acc, seat) => acc + Number(seat.precio || 0), 0),
    [selectedSeats],
  )

  const selectedLabels = useMemo(
    () => selectedSeats.map((seat) => seat.numero_asiento),
    [selectedSeats],
  )

  const handleBack = useCallback(() => {
    navigate(-1)
  }, [navigate])

  const handleNavigate = useCallback(
    (tab) => {
      if (tab === 'buscar') {
        navigate('/buses')
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

  const handleToggleSeat = useCallback(
    async (seat) => {
      if (!seat) return
      setActionError(null)

      const isSelected = selectedIds.includes(seat.idAsiento)

      if (isSelected) {
        setBusyIds((prev) => [...prev, seat.idAsiento])
        setSelectedIds((prev) => prev.filter((id) => id !== seat.idAsiento))
        try {
          await releaseSeatRequest({
            idViaje,
            idAsiento: seat.idAsiento,
            tokenSesion: sessionToken,
          })
          setSeatMap((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              asientos: prev.asientos.map((s) =>
                s.id_asiento === seat.idAsiento
                  ? { ...s, estado_interfaz: SEAT_STATUS.FREE }
                  : s,
              ),
            }
          })
        } catch (err) {
          setSelectedIds((prev) =>
            prev.includes(seat.idAsiento)
              ? prev
              : [...prev, seat.idAsiento],
          )
          setActionError(
            err?.message ||
              'No pudimos liberar el bloqueo del asiento. Intenta nuevamente.',
          )
        } finally {
          setBusyIds((prev) => prev.filter((id) => id !== seat.idAsiento))
        }
        return
      }

      if (seat.estado !== SEAT_STATUS.FREE) return

      setBusyIds((prev) => [...prev, seat.idAsiento])
      try {
        await holdSeatRequest({
          idViaje,
          idAsiento: seat.idAsiento,
          tokenSesion: sessionToken,
        })
        setSelectedIds((prev) => [...prev, seat.idAsiento])
        setSeatMap((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            asientos: prev.asientos.map((s) =>
              s.id_asiento === seat.idAsiento
                ? { ...s, estado_interfaz: SEAT_STATUS.HELD }
                : s,
            ),
          }
        })
      } catch (err) {
        const status = err?.status
        if (status === 409) {
          setSeatMap((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              asientos: prev.asientos.map((s) =>
                s.id_asiento === seat.idAsiento
                  ? { ...s, estado_interfaz: SEAT_STATUS.HELD }
                  : s,
              ),
            }
          })
          setActionError(
            err?.message ||
              'Ese asiento acaba de ser tomado por otro usuario. Actualizamos el mapa.',
          )
        } else {
          setActionError(
            err?.message || 'No pudimos reservar el asiento. Intenta nuevamente.',
          )
        }
      } finally {
        setBusyIds((prev) => prev.filter((id) => id !== seat.idAsiento))
      }
    },
    [idViaje, selectedIds, sessionToken],
  )

  const handleContinue = useCallback(() => {
    if (selectedSeats.length === 0) return

    const seatIds = selectedSeats.map(
      (s) => `${s.piso}-${s.numero_asiento}`,
    )

    const seatsFull = selectedSeats.map((s) => ({
      id_asiento: s.id_asiento,
      numero_asiento: s.numero_asiento,
      piso: s.piso,
      tipo_servicio: s.tipo_servicio,
      precio: s.precio,
      estado: s.estado,
    }))

    try {
      sessionStorage.setItem(
        'bustoke_checkout_seats_full',
        JSON.stringify(seatsFull),
      )
    } catch {
      // ignore (modo privado sin storage)
    }

    navigate('/checkout', {
      state: {
        idViaje,
        selectedSeats: seatIds,
        selectedSeatsFull: seatsFull,
        total,
        trip: tripFromState,
        searchValues,
        origin,
        destination,
        company,
        departureTime: hora,
        date: fecha,
      },
    })
  }, [
    idViaje,
    selectedSeats,
    total,
    tripFromState,
    searchValues,
    origin,
    destination,
    company,
    hora,
    fecha,
    navigate,
  ])

  const tripTitle = `${company} • ${origin} a ${destination}`
  const visibleSeats = grouped.get(Number(activeFloor)) || []
  const visibleServiceType = resolveServiceTypeForFloor(visibleSeats) || 'Normal'
  const floorPrice = useMemo(() => {
    const list = grouped.get(Number(activeFloor)) || []
    if (list.length === 0) return precioBase
    return list[0].precio
  }, [grouped, activeFloor, precioBase])

  if (!validId) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-6">
        <div className="max-w-md bg-white rounded-2xl shadow-card p-6 text-center">
          <h1 className="text-lg font-semibold text-neutral-900 mb-2">
            Viaje no válido
          </h1>
          <p className="text-sm text-neutral-600 mb-4">
            No pudimos identificar el viaje. Vuelve a los resultados y elige
            nuevamente.
          </p>
          <button
            type="button"
            onClick={handleBack}
            className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-blue-700"
          >
            Volver
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="hidden md:block">
        <Navbar onNavigate={handleNavigate} active="buscar" />
        <div className="max-w-7xl mx-auto px-8 py-10">
          <header className="text-center mb-8">
            <h1 className="text-2xl font-bold text-neutral-900">
              Selecciona tus asientos
            </h1>
            <p className="text-sm text-neutral-600 mt-2">
              {tripTitle}
              {fecha ? ` • ${fecha}` : ''}
              {hora ? ` • ${hora}` : ''}
            </p>
          </header>

          {error && !loading && (
            <div className="max-w-xl mx-auto mb-6">
              <Alert variant="error">{error}</Alert>
            </div>
          )}

          {actionError && (
            <div className="max-w-xl mx-auto mb-4">
              <Alert variant="info">{actionError}</Alert>
            </div>
          )}

          {loading ? (
            <div className="grid md:grid-cols-2 gap-8" aria-busy="true">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-72 rounded-2xl bg-white shadow-card animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-8">
              {floors.map((floor) => {
                const floorSeats = grouped.get(floor) || []
                return (
                  <section key={floor} className="flex flex-col gap-4">
                    <h2 className="text-center text-lg font-semibold text-neutral-900">
                      {resolveFloorTitle(floor, floorSeats)}
                    </h2>
                    <BusLayout
                      seats={floorSeats}
                      floor={floor}
                      selectedIds={selectedIds}
                      busyIds={busyIds}
                      onToggle={handleToggleSeat}
                    />
                  </section>
                )
              })}
            </div>
          )}

          {!loading && <Legend />}

          <div className="mt-4">
            <CheckoutBar
              selectedLabels={selectedLabels}
              total={total}
              onContinue={handleContinue}
            />
          </div>
        </div>
      </div>

      <div className="block md:hidden pb-28">
        <header className="bg-blue-600 text-white p-5 text-center">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={handleBack}
              aria-label="Volver a los resultados"
              className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <p className="flex-1 text-sm font-semibold leading-snug text-center pr-7">
              {tripTitle}
            </p>
          </div>
          <FloorTabs
            floors={floors}
            activeFloor={activeFloor}
            onChange={setActiveFloor}
          />
          <p className="text-xs text-white/80 mt-3">
            Asientos: {visibleServiceType} · S/ {Number(floorPrice || 0).toFixed(2)} c/u
          </p>
        </header>

        <main className="flex flex-col gap-4 p-4">
          {error && !loading && <Alert variant="error">{error}</Alert>}
          {actionError && <Alert variant="info">{actionError}</Alert>}

          {loading ? (
            <div className="h-72 rounded-2xl bg-white shadow-card animate-pulse" />
          ) : (
            <BusLayout
              seats={visibleSeats}
              floor={Number(activeFloor)}
              selectedIds={selectedIds}
              busyIds={busyIds}
              onToggle={handleToggleSeat}
            />
          )}

          {!loading && <Legend />}

          <CheckoutBar
            selectedLabels={selectedLabels}
            total={total}
            onContinue={handleContinue}
            dense
          />
        </main>

        <BottomNav active="buscar" onNavigate={handleNavigate} />
      </div>
    </div>
  )
}
