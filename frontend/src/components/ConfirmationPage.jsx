import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bus,
  CircleCheck,
  Download,
  MapPin,
  QrCode,
  Share2,
  X,
} from 'lucide-react'
import GuidedRouteMap, {
  GuidedRouteHeader,
} from './GuidedRouteMap'
import Navbar from './Navbar'
import BottomNav from './BottomNav'

const DEFAULT_DATE = '15/06/2026'
const RESERVATION_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateReservationCode() {
  let code = ''
  for (let i = 0; i < 6; i += 1) {
    code += RESERVATION_CHARS.charAt(
      Math.floor(Math.random() * RESERVATION_CHARS.length),
    )
  }
  return code
}

function buildFullName(parts) {
  if (!parts) return ''
  return [parts.names, parts.paternalSurname, parts.maternalSurname]
    .filter(Boolean)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .join(' ')
}

function formatSeat(seatId) {
  if (!seatId) return ''
  return seatId.split('-').slice(1).join('-')
}

function getServiceLabel(seatId) {
  if (!seatId) return 'Normal'
  const [floor] = seatId.split('-')
  return floor === '2' ? 'VIP' : 'Normal'
}

function getEmbarqueLabel(seatId) {
  const seat = formatSeat(seatId)
  const lastChar = seat.slice(-1)
  const num = Number(lastChar)
  if (Number.isNaN(num)) return 'Rampa 1'
  return `Rampa ${num}`
}

function DesktopSuccessBanner({ onClose }) {
  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="bg-green-100 text-green-700 rounded-xl flex items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-3">
          <CircleCheck className="w-6 h-6 shrink-0" strokeWidth={2.25} />
          <p className="text-sm sm:text-base font-semibold leading-tight">
            ¡Pago exitoso! Tu viaje está confirmado.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar mensaje de éxito"
          className="p-1 rounded-md hover:bg-green-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-center text-sm text-neutral-600 mt-3">
        Tu reserva está confirmada. Te enviamos una copia a tu correo.
      </p>
    </div>
  )
}

function MobileSuccessBanner({ buyerName }) {
  return (
    <div className="w-full bg-green-600 text-white px-5 pt-8 pb-12 rounded-b-[2.5rem] shadow-md">
      <p className="text-2xl font-bold leading-tight">
        ¡Pago exitoso, {buyerName || 'viajero'}!
      </p>
      <p className="text-sm text-white/90 mt-2 leading-snug">
        Tu reserva está confirmada. Te enviamos una copia a tu correo.
      </p>
    </div>
  )
}

function TicketHeader({ origin, destination, date, service }) {
  return (
    <header className="bg-blue-600 text-white p-3 text-center">
      <p className="text-sm sm:text-base font-bold uppercase tracking-wide">
        {origin} ➔ {destination}
      </p>
      <p className="text-[11px] sm:text-xs text-white/80 mt-0.5">
        {date} · {service}
      </p>
    </header>
  )
}

function TicketTimeline({ departureTime, arrivalTime }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex flex-col items-start shrink-0">
        <span className="text-sm font-bold text-neutral-900 leading-none">
          {departureTime}
        </span>
        <span className="text-[10px] text-neutral-500 mt-1">Salida</span>
      </div>
      <div className="flex-1 flex items-center px-1">
        <span
          className="block w-full border-t border-dashed border-neutral-300"
          aria-hidden="true"
        />
        <div className="mx-1 w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
          <Bus className="w-3.5 h-3.5" />
        </div>
        <span
          className="block w-full border-t border-dashed border-neutral-300"
          aria-hidden="true"
        />
      </div>
      <div className="flex flex-col items-end shrink-0">
        <span className="text-sm font-bold text-neutral-900 leading-none">
          {arrivalTime}
        </span>
        <span className="text-[10px] text-neutral-500 mt-1">Llegada</span>
      </div>
    </div>
  )
}

function TicketDetailRow({ label, value, align = 'left' }) {
  return (
    <div className={`flex flex-col gap-0.5 ${align === 'right' ? 'items-end' : 'items-start'}`}>
      <span className="text-[10px] uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      <span className="text-sm font-bold text-neutral-900 leading-tight">
        {value || '—'}
      </span>
    </div>
  )
}

function DigitalTicketCard({ ticket, reservationCode, className = '' }) {
  const {
    origin,
    destination,
    date,
    departureTime,
    arrivalTime,
    passengerName,
    company,
    seat,
    service,
    embarque,
  } = ticket

  const [showMap, setShowMap] = useState(false)

  return (
    <article
      className={`bg-white rounded-2xl shadow-card overflow-hidden flex flex-col ${className}`}
    >
      <TicketHeader
        origin={origin}
        destination={destination}
        date={date}
        service={service}
      />

      <div className="p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3">
          <TicketDetailRow label="Pasajero" value={passengerName} />
          <TicketDetailRow label="Empresa" value={company} />
        </div>

        <TicketTimeline
          departureTime={departureTime}
          arrivalTime={arrivalTime}
        />

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-neutral-100">
          <TicketDetailRow label="Asiento" value={seat} />
          <TicketDetailRow label="Embarque" value={embarque} align="center" />
          <TicketDetailRow label="Servicio" value={service} align="right" />
        </div>

        <button
          type="button"
          onClick={() => setShowMap((prev) => !prev)}
          aria-expanded={showMap}
          aria-controls="guided-route-panel"
          className="w-full mt-1 inline-flex items-center justify-center gap-1.5 text-blue-600 text-xs font-medium bg-transparent border border-blue-100 rounded-lg py-1.5 px-3 hover:bg-blue-50 transition-colors"
        >
          <MapPin className="w-3.5 h-3.5" />
          Cómo llegar al embarque
        </button>

        <div
          id="guided-route-panel"
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            showMap
              ? 'max-h-[320px] opacity-100'
              : 'max-h-0 opacity-0'
          }`}
          aria-hidden={!showMap}
        >
          <div className="flex flex-col gap-2 pt-1">
            <GuidedRouteHeader embarque={embarque} />
            <GuidedRouteMap embarque={embarque} origin={origin} />
          </div>
        </div>
      </div>

      <div className="relative px-4">
        <span
          className="absolute -left-2 -top-2 w-4 h-4 rounded-full bg-neutral-100"
          aria-hidden="true"
        />
        <span
          className="absolute -right-2 -top-2 w-4 h-4 rounded-full bg-neutral-100"
          aria-hidden="true"
        />
        <div className="border-t border-dashed border-neutral-200" />
      </div>

      <div className="p-4 flex flex-col items-center gap-3">
        <p className="text-sm font-bold text-neutral-900">
          Escanear al abordar
        </p>
        <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-lg border border-neutral-200 bg-white flex items-center justify-center">
          <QrCode
            className="w-24 h-24 sm:w-28 sm:h-28 text-neutral-900"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
        <p className="text-xs text-neutral-600">
          Cód. Reserva:{' '}
          <span className="font-semibold text-neutral-900">
            {reservationCode}
          </span>
        </p>
      </div>
    </article>
  )
}

function DotPagination({ total, activeIndex, onSelect }) {
  return (
    <div
      className="flex items-center justify-center gap-2"
      role="tablist"
      aria-label="Paginación de boletos"
    >
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={`dot-${i}`}
          type="button"
          role="tab"
          aria-selected={i === activeIndex}
          aria-label={`Ir al boleto ${i + 1}`}
          onClick={() => onSelect(i)}
          className={`h-2 rounded-full transition-all ${
            i === activeIndex
              ? 'w-6 bg-blue-600'
              : 'w-2 bg-neutral-300 hover:bg-neutral-400'
          }`}
        />
      ))}
    </div>
  )
}

export default function ConfirmationPage({
  trip,
  date,
  selectedSeats,
  passengers,
  buyer,
  onGoHome,
  onGoToTrips,
  onNavigate,
}) {
  const reservationCode = useMemo(() => generateReservationCode(), [])
  const buyerName = useMemo(() => {
    const full = buildFullName(buyer)
    if (full) {
      const first = full.split(' ')[0]
      return first || full
    }
    return ''
  }, [buyer])

  const displayDate = date || DEFAULT_DATE
  const company = trip?.company ?? 'Cruz del Sur'
  const origin = trip?.origin ?? 'Lima'
  const destination = trip?.destination ?? 'Trujillo'
  const departureTime = trip?.departureTime ?? '08:00 AM'
  const arrivalTime = trip?.arrivalTime ?? '04:00 PM'

  const tickets = useMemo(
    () =>
      selectedSeats.map((seatId, index) => {
        const passenger = passengers[index] || {}
        return {
          id: `${seatId}-${index}`,
          origin,
          destination,
          date: displayDate,
          departureTime,
          arrivalTime,
          passengerName: buildFullName(passenger) || 'Pasajero sin nombre',
          company,
          seat: formatSeat(seatId),
          service: getServiceLabel(seatId),
          embarque: getEmbarqueLabel(seatId),
        }
      }),
    [
      selectedSeats,
      passengers,
      origin,
      destination,
      displayDate,
      departureTime,
      arrivalTime,
      company,
    ],
  )

  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="hidden md:block">
        <Navbar onNavigate={onNavigate} active="buscar" />
        <div className="max-w-7xl mx-auto px-8 py-10 flex flex-col gap-6">
          <DesktopSuccessBanner
            onClose={onGoHome}
          />

          <div className="flex flex-row justify-center gap-6 mt-8 flex-wrap">
            {tickets.map((ticket) => (
              <DigitalTicketCard
                key={ticket.id}
                ticket={ticket}
                reservationCode={reservationCode}
                className="w-[320px]"
              />
            ))}
          </div>

          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              type="button"
              className="bg-blue-600 text-white font-medium px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Descargar boletos (PDF)
            </button>
            <button
              type="button"
              onClick={onGoHome}
              className="bg-white text-neutral-900 font-medium px-6 py-2.5 rounded-lg border border-neutral-300 hover:bg-neutral-50 transition-colors"
            >
              Volver al inicio
            </button>
          </div>
        </div>
      </div>

      <div className="block md:hidden pb-32">
        <MobileSuccessBanner buyerName={buyerName} />

        <MobileCarousel
          tickets={tickets}
          reservationCode={reservationCode}
        />

        <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-neutral-200 px-4 py-3 z-40 shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-blue-600 text-blue-600 font-medium text-sm bg-transparent hover:bg-blue-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar PDF
            </button>
            <button
              type="button"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-blue-600 text-blue-600 font-medium text-sm bg-transparent hover:bg-blue-50 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Compartir
            </button>
          </div>
          <button
            type="button"
            onClick={onGoToTrips}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            Ir a Mis Viajes
          </button>
        </div>

        <BottomNav active="mis-viajes" onNavigate={onNavigate} />
      </div>
    </div>
  )
}

function MobileCarousel({ tickets, reservationCode }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollerRef = useRef(null)
  const itemRefs = useRef([])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return undefined

    const handleScroll = () => {
      const scrollLeft = scroller.scrollLeft
      const viewportWidth = scroller.clientWidth
      const center = scrollLeft + viewportWidth / 2
      let closestIndex = 0
      let closestDistance = Infinity
      itemRefs.current.forEach((node, index) => {
        if (!node) return
        const nodeCenter = node.offsetLeft + node.offsetWidth / 2
        const distance = Math.abs(nodeCenter - center)
        if (distance < closestDistance) {
          closestDistance = distance
          closestIndex = index
        }
      })
      setActiveIndex(closestIndex)
    }

    scroller.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => scroller.removeEventListener('scroll', handleScroll)
  }, [tickets.length])

  const handleSelect = (index) => {
    const node = itemRefs.current[index]
    const scroller = scrollerRef.current
    if (!node || !scroller) return
    const targetLeft =
      node.offsetLeft - (scroller.clientWidth - node.offsetWidth) / 2
    scroller.scrollTo({ left: targetLeft, behavior: 'smooth' })
  }

  if (tickets.length === 0) {
    return (
      <div className="px-4 mt-6 text-center text-sm text-neutral-600">
        No hay boletos para mostrar.
      </div>
    )
  }

  return (
    <div className="px-4 mt-6 flex flex-col gap-4">
      <p className="text-center text-xs font-medium text-neutral-600">
        Boleto {activeIndex + 1} de {tickets.length}
      </p>

      <div
        ref={scrollerRef}
        className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-2 -mx-4 px-4"
        style={{ scrollbarWidth: 'none' }}
        role="region"
        aria-label="Boletos digitales"
      >
        {tickets.map((ticket, index) => (
          <div
            key={ticket.id}
            ref={(el) => {
              itemRefs.current[index] = el
            }}
            className="snap-center shrink-0 w-[85vw] max-w-sm"
          >
            <DigitalTicketCard
              ticket={ticket}
              reservationCode={reservationCode}
            />
          </div>
        ))}
      </div>

      <DotPagination
        total={tickets.length}
        activeIndex={activeIndex}
        onSelect={handleSelect}
      />
    </div>
  )
}
