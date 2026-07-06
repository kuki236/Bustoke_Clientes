import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Star, Bath, Layers, Clock, X } from 'lucide-react'
import Navbar from './Navbar'
import BottomNav from './BottomNav'
import Alert from './Alert'

const RESERVATION_SECONDS = 600
const ALERT_THRESHOLD_SECONDS = 120

function formatTimeLeft(seconds) {
  const total = Math.max(0, Number(seconds) || 0)
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function ReservationTimerBadge({ timeLeft }) {
  if (timeLeft == null) return null
  const isAlert = timeLeft <= ALERT_THRESHOLD_SECONDS
  const baseClasses =
    'px-3 py-1 rounded-md font-medium text-sm flex items-center gap-1.5 leading-none'
  const variantClasses = isAlert
    ? 'bg-red-50 text-red-600 border border-red-200 animate-pulse'
    : 'bg-slate-50 text-slate-700 border border-slate-200'
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Tiempo restante de reserva ${formatTimeLeft(timeLeft)}`}
      className={`${baseClasses} ${variantClasses}`}
    >
      <Clock className="w-4 h-4 leading-none" aria-hidden="true" />
      <span className="leading-none">{formatTimeLeft(timeLeft)}</span>
    </div>
  )
}

function ExpiredModal({ open, onAccept }) {
  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reservation-expired-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-neutral-900/50"
    >
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-card p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" aria-hidden="true" />
          </div>
          <button
            type="button"
            onClick={onAccept}
            aria-label="Cerrar"
            className="p-1 rounded-full text-neutral-500 hover:bg-neutral-100"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          <h2
            id="reservation-expired-title"
            className="text-base font-semibold text-neutral-900"
          >
            Tiempo de reserva expirado
          </h2>
          <p className="text-sm text-neutral-600 leading-relaxed">
            Tu tiempo de reserva ha expirado. Por favor, selecciona tus asientos
            nuevamente.
          </p>
        </div>
        <button
          type="button"
          onClick={onAccept}
          className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          Aceptar
        </button>
      </div>
    </div>
  )
}
import {
  fetchSeatMapRequest,
  holdSeatRequest,
  releaseSeatRequest,
  releaseHoldsBeacon,
  SEAT_STATUS,
} from '../api/seats'
import { useAuth } from '../context/AuthContext'

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

/**
 * FIX bug UX "no se ve el precio del VIP antes de seleccionarlo":
 * devuelve un objeto `{normal: 50, vip: 110}` con los precios distintos
 * que existen en el piso (solo los tipos que tienen al menos 1 asiento).
 * Si solo hay un tipo, el objeto tiene una sola key.
 *
 * Se usa para que el header muestre "Normal · S/ 50 · VIP · S/ 110"
 * en lugar del `list[0].precio` que mentía cuando el primer asiento
 * era el más barato.
 */
function resolvePriceByServiceType(seats) {
  const out = {}
  if (!Array.isArray(seats)) return out
  for (const seat of seats) {
    const type = normalizeServiceType(seat.tipoServicio)
    if (!type) continue
    if (out[type] === undefined) {
      out[type] = Number(seat.precio) || 0
    }
  }
  return out
}

function formatPriceLabel(pricesByType) {
  const entries = Object.entries(pricesByType)
  if (entries.length === 0) return ''
  // Orden estable: Normal primero, VIP después (si están los dos)
  const order = ['Normal', 'Vip', 'VIP']
  entries.sort(([a], [b]) => {
    const ia = order.findIndex((o) => o.toLowerCase() === a.toLowerCase())
    const ib = order.findIndex((o) => o.toLowerCase() === b.toLowerCase())
    if (ia === -1 && ib === -1) return 0
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
  return entries
    .map(([type, price]) => `${type} · S/ ${Number(price).toFixed(2)}`)
    .join(' · ')
}

function resolveFloorTitle(floor, seats) {
  const baseLabel = FLOOR_LABELS[floor] || `Piso ${floor}`
  const serviceType = resolveServiceTypeForFloor(seats)
// FIX bug UX: si el piso tiene tipos mixtos (Normal + VIP), el

  return serviceType ? `${baseLabel} (${serviceType})` : baseLabel
}

const SEAT_BASE_CLASSES =
  'w-10 h-10 text-xs font-semibold rounded-lg flex flex-col items-center justify-center transition-all'

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
    return 'bg-white border-2 border-slate-200 text-slate-700 opacity-60 cursor-wait'
  }
  return 'bg-white border-2 border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-600'
}

function getStarClasses({ isVip, selected, estado }) {
  if (!isVip) return null
  if (estado === SEAT_STATUS.OCCUPIED) {
    return 'fill-white text-white'
  }
  if (selected) {
    return 'fill-white text-white'
  }
  if (estado === SEAT_STATUS.HELD) {
    return 'fill-orange-300 text-orange-300'
  }
  return 'fill-orange-300 text-orange-300'
}

function SeatButton({ label, isVip, selected, estado, busy, onToggle }) {
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
  const starClasses = getStarClasses({ isVip, selected, estado })

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      aria-disabled={disabled}
      aria-label={ariaLabel}
      className={`${SEAT_BASE_CLASSES} ${getSeatButtonClasses({ selected, estado, busy })}`}
    >
      {starClasses && (
        <Star
          className={`w-2.5 h-2.5 mb-px ${starClasses}`}
          strokeWidth={0}
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
    </button>
  )
}

function buildSeatRows(seats) {
  if (!Array.isArray(seats) || seats.length === 0) return []
  const sorted = [...seats].sort(
    (a, b) =>
      (Number(a.coordY) || 0) - (Number(b.coordY) || 0) ||
      (Number(a.coordX) || 0) - (Number(b.coordX) || 0),
  )
  const rows = []
  let current = []
  let currentY = null
  const tolerance = 8
  for (const seat of sorted) {
    const y = Number(seat.coordY) || 0
    if (currentY === null || Math.abs(y - currentY) <= tolerance) {
      current.push(seat)
      currentY = currentY === null ? y : (currentY * (current.length - 1) + y) / current.length
    } else {
      rows.push(current)
      current = [seat]
      currentY = y
    }
  }
  if (current.length > 0) rows.push(current)
  return rows.map((row) =>
    [...row].sort((a, b) => (Number(a.coordX) || 0) - (Number(b.coordX) || 0)),
  )
}

const AISLE_CELL = (
  <div aria-hidden="true" className="w-full" key="aisle-cell" />
)

function BusLayout({ seats, floor, selectedIds, busyIds, onToggle }) {
  if (seats.length === 0) {
    return (
      <div className="relative w-[340px] bg-white rounded-3xl border border-neutral-200 pt-14 pb-14 px-6 mx-auto shadow-sm overflow-hidden flex items-center justify-center min-h-[420px]">
        <p className="text-sm text-neutral-500">
          No hay asientos en este piso.
        </p>
      </div>
    )
  }

  const rows = buildSeatRows(seats)
  const maxRowLength = rows.reduce((acc, r) => Math.max(acc, r.length), 0)
  const paddedRowLength = Math.max(maxRowLength, 4)
  const leftCount = Math.floor(paddedRowLength / 2)
  const rightStart = leftCount + 1

  return (
    <div className="relative w-[340px] bg-white rounded-3xl border border-neutral-200 pt-14 pb-14 px-6 mx-auto shadow-sm overflow-hidden">
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-100 text-neutral-500 text-[10px] font-semibold uppercase tracking-wider"
        aria-label="Frente del bus"
      >
        <SteeringWheel className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Frente / Chofer</span>
      </div>

      <div className="grid grid-cols-5 gap-y-3 gap-x-2 place-items-center">
        {rows.map((row, rowIdx) => {
          const cells = []
          for (let col = 0; col < paddedRowLength + 1; col++) {
            if (col === leftCount) {
              cells.push(
                <div
                  key={`aisle-${floor}-${rowIdx}-${col}`}
                  aria-hidden="true"
                  className="w-full"
                />,
              )
              continue
            }
            const seat = row[col >= rightStart ? col - 1 : col]
            if (!seat) {
              cells.push(
                <span
                  key={`empty-${floor}-${rowIdx}-${col}`}
                  aria-hidden="true"
                  className="w-10 h-10"
                />,
              )
              continue
            }
            const label = cleanSeatLabel(seat.numeroAsiento)
            const isVip = String(seat.tipoServicio || '').toLowerCase() === 'vip'
            cells.push(
              <SeatButton
                key={`${floor}-${seat.idAsiento}`}
                label={label}
                isVip={isVip}
                selected={selectedIds.includes(seat.idAsiento)}
                estado={seat.estado}
                busy={busyIds.includes(seat.idAsiento)}
                onToggle={() => onToggle(seat)}
              />,
            )
          }
          return cells
        })}
      </div>

      <div className="mt-6 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-100"
          aria-label="Escalera de acceso"
        >
          <Layers className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Escalera</span>
        </div>
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-100"
          aria-label="Baño"
        >
          <Bath className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Baño</span>
        </div>
      </div>
    </div>
  )
}

function Legend({ showBlocked = true }) {
// FIX bug UX: el precio del VIP (y de cualquier tipo) se muestra

  const items = [
    { label: 'Libre', swatch: 'bg-white border-blue-600' },
    { label: 'Ocupado', swatch: 'bg-red-600 border-red-600' },
  ]
  if (showBlocked) {
    items.push({ label: 'Bloqueado', swatch: 'bg-neutral-200 border-neutral-200' })
  }
  items.push({ label: 'Seleccionado', swatch: 'bg-blue-600 border-blue-600' })
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
  const { user } = useAuth()
  const currentUserId = user?.id ?? user?.id_usuario ?? user?.idUsuario ?? null

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
  const [timeLeft, setTimeLeft] = useState(null)
  const [showExpiredModal, setShowExpiredModal] = useState(false)
  const expiredHandledRef = useRef(false)

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
    if (selectedIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTimeLeft(null)
      expiredHandledRef.current = false
      return
    }
    if (timeLeft == null) {
      setTimeLeft(RESERVATION_SECONDS)
      return
    }
    if (timeLeft <= 0) return
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [selectedIds.length, timeLeft])

  useEffect(() => {
    if (timeLeft === 0 && selectedIds.length > 0 && !expiredHandledRef.current) {
      expiredHandledRef.current = true
      setShowExpiredModal(true)
    }
  }, [timeLeft, selectedIds.length])

  const handleAcceptExpired = useCallback(async () => {
    const idsToRelease = selectedIds.slice()
    setShowExpiredModal(false)
    setSelectedIds([])
    setSeatMap((prev) => {
      if (!prev || idsToRelease.length === 0) return prev
      return {
        ...prev,
        asientos: prev.asientos.map((s) =>
          idsToRelease.includes(s.id_asiento)
            ? { ...s, estado_interfaz: SEAT_STATUS.FREE }
            : s,
        ),
      }
    })
    setTimeLeft(null)
    expiredHandledRef.current = false
    for (const idAsiento of idsToRelease) {
      const body = {
        idViaje,
        idAsiento,
        tokenSesion: sessionToken,
      }
      if (currentUserId) body.idUsuario = currentUserId
      try {
        await releaseSeatRequest(body)
      } catch (err) {
        console.warn('[SeatSelection] expiration release failed', err)
      }
    }
  }, [selectedIds, idViaje, sessionToken, currentUserId])

// FIX BUG-049/050/051: cleanup unificado. Hay 3 eventos de cierre

  const beaconFiredRef = useRef(false)
  const selectedIdsRef = useRef(selectedIds)
  const idViajeRef = useRef(idViaje)
  const sessionTokenRef = useRef(sessionToken)
  const currentUserIdRef = useRef(currentUserId)
// FIX BUG checkout "Algunos asientos no tienen un bloqueo activo":

  const navigatingToCheckoutRef = useRef(false)

  useEffect(() => {
    selectedIdsRef.current = selectedIds
  }, [selectedIds])
  useEffect(() => {
    idViajeRef.current = idViaje
  }, [idViaje])
  useEffect(() => {
    sessionTokenRef.current = sessionToken
  }, [sessionToken])
  useEffect(() => {
    currentUserIdRef.current = currentUserId
  }, [currentUserId])

  useEffect(() => {
    const fireBeacon = () => {
      const ids = selectedIdsRef.current
      if (!ids || ids.length === 0) return
      if (beaconFiredRef.current) return
      const items = ids.map((idAsiento) => ({
        idViaje: idViajeRef.current,
        idAsiento,
        tokenSesion: sessionTokenRef.current,
      }))
      const ok = releaseHoldsBeacon(items)
      if (ok) beaconFiredRef.current = true
    }
    // pagehide cubre F5, cerrar pestaña, navegación away
    window.addEventListener('pagehide', fireBeacon)
    // beforeunload es backup en navegadores viejos
    window.addEventListener('beforeunload', fireBeacon)
    return () => {
      window.removeEventListener('pagehide', fireBeacon)
      window.removeEventListener('beforeunload', fireBeacon)
    }
  }, [])

  useEffect(() => {
    return () => {
      // Si el beacon YA se disparó (caso BACK / F5), no duplicar
      // requests por el cleanup async.
      if (beaconFiredRef.current) return
// FIX checkout 409: si el unmount se debe a que vamos a

      if (navigatingToCheckoutRef.current) return
      const holds = selectedIdsRef.current
      if (!holds || holds.length === 0) return
      const currentSession = sessionTokenRef.current
      const currentViaje = idViajeRef.current
      const currentUser = currentUserIdRef.current
      holds.forEach((idAsiento) => {
        const body = {
          idViaje: currentViaje,
          idAsiento,
          tokenSesion: currentSession,
        }
        if (currentUser) body.idUsuario = currentUser
        releaseSeatRequest(body).catch((err) => {
          console.warn('[SeatSelection] unmount release failed', err)
        })
      })
    }
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

  const hasManualBlock = useMemo(() => {
    if (!seatMap) return false
    return (seatMap.asientos || []).some(
      (seat) => seat?.bloqueado_manual === true,
    )
  }, [seatMap])

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
        try {
          const body = {
            idViaje,
            idAsiento: seat.idAsiento,
            tokenSesion: sessionToken,
          }
          if (currentUserId) body.idUsuario = currentUserId
          await releaseSeatRequest(body)
          setSelectedIds((prev) => prev.filter((id) => id !== seat.idAsiento))
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
          console.error('[SeatSelection] release failed', err)
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
          idUsuario: currentUserId,
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

// FIX checkout 409: marca la navegación hacia /checkout ANTES de

    navigatingToCheckoutRef.current = true

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
  const pricesByType = useMemo(
    () => resolvePriceByServiceType(visibleSeats),
    [visibleSeats],
  )
  const priceLabel = formatPriceLabel(pricesByType)
  const floorPrice = useMemo(() => {
// FIX bug UX: si el piso tiene precios mixtos, usamos el

    const list = grouped.get(Number(activeFloor)) || []
    if (list.length === 0) return precioBase
    const min = list.reduce(
      (acc, s) => Math.min(acc, Number(s.precio) || Infinity),
      Infinity,
    )
    return Number.isFinite(min) ? min : precioBase
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
        <Navbar
          onNavigate={handleNavigate}
          active="buscar"
          timerSlot={<ReservationTimerBadge timeLeft={timeLeft} />}
        />
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
            // FIX bug visual: el grid era siempre md:grid-cols-2,
            // dejando la 2da columna vacía cuando el bus tiene 1 piso.
            <div
              className={`grid gap-8 ${
                floors.length > 1 ? 'md:grid-cols-2' : 'md:grid-cols-1 md:max-w-md md:mx-auto'
              }`}
              aria-busy="true"
            >
              {floors.map((floor) => (
                <div
                  key={floor}
                  className="h-72 rounded-2xl bg-white shadow-card animate-pulse"
                />
              ))}
            </div>
          ) : (
// FIX bug visual: misma corrección para el grid renderizado.

            <div
              className={`grid gap-8 ${
                floors.length > 1 ? 'md:grid-cols-2' : 'md:grid-cols-1 md:max-w-md md:mx-auto'
              }`}
            >
              {floors.map((floor) => {
                const floorSeats = grouped.get(floor) || []
                const floorPrices = resolvePriceByServiceType(floorSeats)
                const floorPriceLabel = formatPriceLabel(floorPrices)
                return (
                  <section key={floor} className="flex flex-col gap-4">
                    <h2 className="text-center text-lg font-semibold text-neutral-900">
                      {resolveFloorTitle(floor, floorSeats)}
                    </h2>
                    {/* FIX bug UX "no se ve el precio del VIP antes de
                        seleccionarlo": desglose por tipo de servicio
                        visible ANTES de que el usuario clickee nada. */}
                    {floorPriceLabel && (
                      <p className="text-center text-xs font-medium text-neutral-600 -mt-2">
                        {floorPriceLabel}
                        <span className="text-neutral-400"> c/u</span>
                      </p>
                    )}
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

          {!loading && <Legend showBlocked={hasManualBlock} />}

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
            {priceLabel || (
              // Fallback: piso sin asientos todavía (estado de carga)
              <>Asientos: {visibleServiceType} · S/ {Number(floorPrice || 0).toFixed(2)} c/u</>
            )}
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

          {!loading && <Legend showBlocked={hasManualBlock} />}

          <CheckoutBar
            selectedLabels={selectedLabels}
            total={total}
            onContinue={handleContinue}
            dense
          />
        </main>

        <BottomNav active="buscar" onNavigate={handleNavigate} />
      </div>

      <ExpiredModal open={showExpiredModal} onAccept={handleAcceptExpired} />
    </div>
  )
}
