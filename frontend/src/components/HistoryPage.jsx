import { useState } from 'react'
import { Bus, Download, FileText, MapPin, TriangleAlert } from 'lucide-react'
import { MOCK_TRIP_HISTORY } from '../data/mockTripHistory'
import GuidedRouteMap, {
  GuidedRouteHeader,
} from './GuidedRouteMap'
import BottomNav from './BottomNav'
import Navbar from './Navbar'

function formatPrice(value) {
  return `S/ ${value.toFixed(2)}`
}

function StatusBadge({ status }) {
  if (status === 'pendiente') {
    return (
      <span className="bg-orange-50 text-orange-600 border border-orange-200 rounded-full px-4 py-1 text-sm font-medium">
        Pendiente
      </span>
    )
  }
  return (
    <span className="bg-green-100 text-green-700 rounded-full px-4 py-1 text-sm font-medium">
    Completado
  </span>
  )
}

function ServiceBadge({ service }) {
  return (
    <span className="bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-full px-3 py-1 text-xs font-medium">
      {service}
    </span>
  )
}

function TimeStop({ time, city, align = 'left' }) {
  return (
    <div
      className={`flex flex-col ${align === 'right' ? 'items-end' : 'items-start'}`}
    >
      <span className="text-sm font-semibold text-neutral-900 leading-tight">
        {time}
      </span>
      <span className="text-[11px] text-neutral-500 mt-0.5">{city}</span>
    </div>
  )
}

function Timeline({ origin, destination, departureTime, arrivalTime }) {
  return (
    <div className="flex items-center justify-center gap-2">
      <TimeStop time={departureTime} city={origin} align="left" />
      <div className="flex-1 flex items-center px-1 min-w-0">
        <span
          className="block flex-1 border-t border-dashed border-neutral-300"
          aria-hidden="true"
        />
        <div className="mx-1 w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
          <Bus className="w-3.5 h-3.5" />
        </div>
        <span
          className="block flex-1 border-t border-dashed border-neutral-300"
          aria-hidden="true"
        />
      </div>
      <TimeStop time={arrivalTime} city={destination} align="right" />
    </div>
  )
}

function ReportIssueTooltip({ onReportIssue, trip, iconClassName = '' }) {
  return (
    <div className="group relative inline-block">
      <button
        type="button"
        onClick={() => onReportIssue?.(trip)}
        aria-label="Reportar problema o reclamo"
        className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors ${iconClassName}`}
      >
        <TriangleAlert className="w-4 h-4" />
      </button>
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 text-xs font-medium text-white bg-neutral-900 rounded-md shadow-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-200 z-50"
      >
        Reportar problema o reclamo
        <span
          className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-neutral-900"
          aria-hidden="true"
        />
      </div>
    </div>
  )
}

function getEmbarqueFromSeat(seat) {
  const lastChar = String(seat ?? '').slice(-1)
  const num = Number(lastChar)
  if (Number.isNaN(num) || num < 1) return 'Rampa 1'
  return `Rampa ${num}`
}

function GuidedRouteToggle({ trip, children }) {
  const [showMap, setShowMap] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setShowMap((prev) => !prev)}
        aria-expanded={showMap}
        aria-controls={`guided-route-panel-${trip.id}`}
        className="w-full mt-1 inline-flex items-center justify-center gap-1.5 text-blue-600 text-xs font-medium bg-transparent border border-blue-100 rounded-lg py-1.5 px-3 hover:bg-blue-50 transition-colors"
      >
        <MapPin className="w-3.5 h-3.5" />
        Cómo llegar al embarque
      </button>
      <div
        id={`guided-route-panel-${trip.id}`}
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          showMap
            ? 'max-h-[320px] opacity-100'
            : 'max-h-0 opacity-0'
        }`}
        aria-hidden={!showMap}
      >
        <div className="flex flex-col gap-2 pt-2">{children}</div>
      </div>
    </>
  )
}

function HistoryCardMobile({ trip, onReportIssue }) {
  const embarque = getEmbarqueFromSeat(trip.seat)
  return (
    <article className="bg-white border border-neutral-100 rounded-2xl shadow-card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className="mt-1 w-4 h-4 rounded-full border-2 border-blue-600 bg-white shrink-0"
            aria-hidden="true"
          />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-neutral-900 truncate">
              {trip.company}
            </span>
            <span className="text-xs text-neutral-500 mt-0.5">
              {trip.date}
            </span>
          </div>
        </div>
        <span className="text-sm font-bold text-neutral-900 shrink-0">
          {formatPrice(trip.price)}
        </span>
      </div>

      <Timeline
        origin={trip.origin}
        destination={trip.destination}
        departureTime={trip.departureTime}
        arrivalTime={trip.arrivalTime}
      />

      <div className="flex items-center justify-between gap-2 pt-1">
        <ServiceBadge service={trip.service} />
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Descargar boleto"
            className="w-9 h-9 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
          <ReportIssueTooltip trip={trip} onReportIssue={onReportIssue} />
        </div>
        <StatusBadge status={trip.status} />
      </div>

      {trip.status === 'pendiente' && (
        <GuidedRouteToggle trip={trip}>
          <GuidedRouteHeader embarque={embarque} />
          <GuidedRouteMap embarque={embarque} origin={trip.origin} />
        </GuidedRouteToggle>
      )}
    </article>
  )
}

function HistoryCardDesktop({ trip, onReportIssue }) {
  const embarque = getEmbarqueFromSeat(trip.seat)
  return (
    <article className="bg-white border border-neutral-100 rounded-2xl shadow-card p-5 flex flex-col gap-4 h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <FileText className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-neutral-900 truncate">
              {trip.company}
            </span>
            <span className="text-xs text-neutral-500 mt-0.5">
              {trip.date} · Asiento {trip.seat}
            </span>
          </div>
        </div>
        <StatusBadge status={trip.status} />
      </div>

      <Timeline
        origin={trip.origin}
        destination={trip.destination}
        departureTime={trip.departureTime}
        arrivalTime={trip.arrivalTime}
      />

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-100">
        <ServiceBadge service={trip.service} />
        <span className="text-sm font-bold text-neutral-900">
          {formatPrice(trip.price)}
        </span>
        <div className="flex items-center gap-1.5">
          <ReportIssueTooltip trip={trip} onReportIssue={onReportIssue} />
          <button
            type="button"
            aria-label="Descargar boleto en PDF"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-600 text-blue-600 text-sm font-medium hover:bg-blue-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            PDF
          </button>
        </div>
      </div>

      {trip.status === 'pendiente' && (
        <GuidedRouteToggle trip={trip}>
          <GuidedRouteHeader embarque={embarque} />
          <GuidedRouteMap embarque={embarque} origin={trip.origin} />
        </GuidedRouteToggle>
      )}
    </article>
  )
}

export default function HistoryPage({ onNavigate, onReportIssue }) {
  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="hidden md:block">
        <Navbar onNavigate={onNavigate} active="mis-viajes" />
        <div className="max-w-7xl mx-auto p-8">
          <header className="mb-6">
            <h1 className="text-3xl font-bold text-neutral-900">
              Mis Viajes Contratados
            </h1>
            <p className="text-sm text-neutral-600 mt-2">
              Consulta y descarga los boletos de tus viajes adquiridos.
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {MOCK_TRIP_HISTORY.map((trip) => (
              <HistoryCardDesktop
                key={trip.id}
                trip={trip}
                onReportIssue={onReportIssue}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="block md:hidden pb-24">
        <header className="bg-blue-600 text-white p-6 text-center text-xl font-bold">
          Encuentra aquí tus viajes
        </header>

        <main className="flex flex-col gap-4 p-4">
          {MOCK_TRIP_HISTORY.map((trip) => (
            <HistoryCardMobile
              key={trip.id}
              trip={trip}
              onReportIssue={onReportIssue}
            />
          ))}
        </main>

        <BottomNav active="trips" onNavigate={onNavigate} />
      </div>
    </div>
  )
}
