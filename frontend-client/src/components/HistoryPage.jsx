import { useEffect, useState } from 'react'
import { Bus, Download, FileText, Loader2, MapPin, RefreshCw, TriangleAlert } from 'lucide-react'
import { fetchHistorialRequest } from '../api/boletos'
import { useAuth } from '../context/AuthContext'
import { downloadTicketPdf } from '../utils/pdfGenerator'
import AvatarMenu from './AvatarMenu'
import GuidedRouteMap, {
  GuidedRouteHeader,
} from './GuidedRouteMap'
import BottomNav from './BottomNav'
import Navbar from './Navbar'

function formatPrice(value) {
  if (value == null) return 'S/ 0.00'
  return `S/ ${Number(value).toFixed(2)}`
}

function StatusBadge({ status }) {
  // FIX BUG-124: manejamos los nuevos status derivados
  // ("Cancelado", "Viaje cancelado") además de los originales.
  const s = String(status || '').toLowerCase()
  if (s === 'pendiente') {
    return (
      <span className="bg-orange-50 text-orange-600 border border-orange-200 rounded-full px-4 py-1 text-sm font-medium">
        Pendiente
      </span>
    )
  }
  if (s.includes('cancelado')) {
    return (
      <span className="bg-red-50 text-red-600 border border-red-200 rounded-full px-4 py-1 text-sm font-medium">
        {status}
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
      className={`flex flex-col min-w-0 ${
        align === 'right' ? 'items-end' : 'items-start'
      }`}
    >
      <span className="text-sm font-semibold text-neutral-900 leading-tight">
        {time}
      </span>
      <span
        className="text-[11px] text-neutral-500 mt-0.5 leading-snug w-full"
        title={city}
      >
        {city}
      </span>
    </div>
  )
}

function Timeline({ origin, destination, departureTime, arrivalTime }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <TimeStop time={departureTime} city={origin} align="left" />
      <div className="flex items-center shrink-0">
        <span
          className="block w-10 border-t border-dashed border-neutral-300"
          aria-hidden="true"
        />
        <div className="mx-1 w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
          <Bus className="w-3.5 h-3.5" />
        </div>
        <span
          className="block w-10 border-t border-dashed border-neutral-300"
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

// FIX BUG-126: la rampa de embarque viene del backend en
// `viaje.rampa_embarque`. Se removió la función que la calculaba
// del último dígito del asiento (era información FALSA).
// `trip.rampaEmbarque` lo provee el normalizador de api/boletos.js
// desde el response del endpoint /v1/boletos/historial.

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
  // FIX BUG-126: rampa viene del backend, no se calcula del asiento.
  const embarque = trip.rampaEmbarque
    ? `Rampa ${trip.rampaEmbarque}`
    : 'Rampa por asignar'
  // FIX BUG-154: pasamos el nombre de la ciudad como dirección de mapa
  // (la dirección específica del terminal requeriría extender la API
  // para incluir `terminal.direccion` en el response del historial).
  const mapAddress = trip.origin
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(null)

  const handleDownload = async () => {
    setDownloadError(null)
    setDownloading(true)
    try {
      await downloadTicketPdf(trip)
    } catch (err) {
      setDownloadError(err?.message || 'No se pudo generar el PDF.')
    } finally {
      setDownloading(false)
    }
  }

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
            onClick={handleDownload}
            disabled={downloading}
            aria-label="Descargar boleto en PDF"
            title="Descargar boleto en PDF"
            className="w-9 h-9 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
          </button>
          <ReportIssueTooltip trip={trip} onReportIssue={onReportIssue} />
        </div>
        <StatusBadge status={trip.status} />
      </div>

      {downloadError && (
        <p className="text-xs text-red-600" role="alert">
          {downloadError}
        </p>
      )}

      {String(trip.status || '').toLowerCase() === 'pendiente' && (
        <GuidedRouteToggle trip={trip}>
          <GuidedRouteHeader embarque={embarque} />
          <GuidedRouteMap
            embarque={embarque}
            origin={trip.origin}
            destinationName={mapAddress}
          />
        </GuidedRouteToggle>
      )}
    </article>
  )
}

function HistoryCardDesktop({ trip, onReportIssue }) {
  // FIX BUG-126: rampa viene del backend, no se calcula del asiento.
  const embarque = trip.rampaEmbarque
    ? `Rampa ${trip.rampaEmbarque}`
    : 'Rampa por asignar'
  const mapAddress = trip.origin
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(null)

  const handleDownload = async () => {
    setDownloadError(null)
    setDownloading(true)
    try {
      await downloadTicketPdf(trip)
    } catch (err) {
      setDownloadError(err?.message || 'No se pudo generar el PDF.')
    } finally {
      setDownloading(false)
    }
  }

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
            onClick={handleDownload}
            disabled={downloading}
            aria-label="Descargar boleto en PDF"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-600 text-blue-600 text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {downloading ? 'Generando…' : 'PDF'}
          </button>
        </div>
      </div>

      {downloadError && (
        <p className="text-xs text-red-600" role="alert">
          {downloadError}
        </p>
      )}

      {String(trip.status || '').toLowerCase() === 'pendiente' && (
        <GuidedRouteToggle trip={trip}>
          <GuidedRouteHeader embarque={embarque} />
          <GuidedRouteMap
            embarque={embarque}
            origin={trip.origin}
            destinationName={mapAddress}
          />
        </GuidedRouteToggle>
      )}
    </article>
  )
}

function LoadingState({ isMobile = false }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${
        isMobile ? 'py-16' : 'py-20'
      } text-neutral-500`}
    >
      <div className="w-9 h-9 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      <p className="text-sm font-medium">Cargando tus viajes...</p>
    </div>
  )
}

function ErrorState({ message, onRetry, isMobile = false }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${
        isMobile ? 'py-12 px-4' : 'py-16'
      } text-center`}
    >
      <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
        <TriangleAlert className="w-6 h-6" />
      </div>
      <p className="text-sm font-semibold text-neutral-900">
        No pudimos cargar tus viajes
      </p>
      <p className="text-xs text-neutral-500 max-w-sm">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-4 py-2 mt-1 rounded-lg border border-blue-600 text-blue-600 text-sm font-medium hover:bg-blue-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Reintentar
        </button>
      )}
    </div>
  )
}

function EmptyState({ isMobile = false, onNavigate }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${
        isMobile ? 'py-12 px-4' : 'py-16'
      } text-center`}
    >
      <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
        <Bus className="w-7 h-7" />
      </div>
      <p className="text-base font-semibold text-neutral-900">
        Aún no tienes viajes contratados
      </p>
      <p className="text-sm text-neutral-500 max-w-sm">
        Cuando compres tu primer boleto, aparecerá aquí con todos los detalles
        del viaje, asiento y embarque.
      </p>
      {onNavigate && (
        <button
          type="button"
          onClick={() => onNavigate('buscar')}
          className="mt-2 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          Buscar viajes
        </button>
      )}
    </div>
  )
}

function NotAuthenticatedState({ isMobile = false, onNavigate }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-center ${
        isMobile
          ? 'flex-1 px-6 py-12 min-h-[60vh]'
          : 'py-16'
      }`}
    >
      <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
        <FileText className="w-7 h-7" />
      </div>
      <p className="text-base font-semibold text-neutral-900">
        Inicia sesión para ver tus viajes
      </p>
      <p className="text-sm text-neutral-500 max-w-sm">
        Necesitamos identificarte para mostrar el historial de tus boletos
        contratados.
      </p>
      {onNavigate && (
        <button
          type="button"
          onClick={() => onNavigate('login')}
          className="mt-2 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          Iniciar sesión
        </button>
      )}
    </div>
  )
}

function HistoryList({ trips, isMobile, onReportIssue }) {
  if (isMobile) {
    return (
      <main className="flex flex-col gap-4 p-4">
        {trips.map((trip) => (
          <HistoryCardMobile
            key={trip.id}
            trip={trip}
            onReportIssue={onReportIssue}
          />
        ))}
      </main>
    )
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {trips.map((trip) => (
        <HistoryCardDesktop
          key={trip.id}
          trip={trip}
          onReportIssue={onReportIssue}
        />
      ))}
    </div>
  )
}

export default function HistoryPage({ onNavigate, onReportIssue }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const loadHistorial = async () => {
    setLoading(true)
    setError(null)
    try {
      const items = await fetchHistorialRequest()
      setTrips(items)
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        'Error inesperado al consultar tu historial.'
      setError(message)
      setTrips([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) {
      setTrips([])
      setError(null)
      setLoading(false)
      return
    }
    loadHistorial()
  }, [isAuthenticated, authLoading, user?.id_usuario])

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

          {authLoading || loading ? (
            <LoadingState />
          ) : !isAuthenticated ? (
            <NotAuthenticatedState onNavigate={onNavigate} />
          ) : error ? (
            <ErrorState message={error} onRetry={loadHistorial} />
          ) : trips.length === 0 ? (
            <EmptyState onNavigate={onNavigate} />
          ) : (
            <HistoryList
              trips={trips}
              isMobile={false}
              onReportIssue={onReportIssue}
            />
          )}
        </div>
      </div>

      <div className="block md:hidden pb-24 flex flex-col min-h-screen">
        <header className="bg-blue-600 text-white p-6 flex items-center justify-between">
          <span className="flex-1 text-center text-xl font-bold">
            Encuentra aquí tus viajes
          </span>
          {isAuthenticated && (
            <AvatarMenu
              user={user}
              onNavigate={onNavigate}
              variant="light"
            />
          )}
        </header>

        {authLoading || loading ? (
          <LoadingState isMobile />
        ) : !isAuthenticated ? (
          <NotAuthenticatedState isMobile onNavigate={onNavigate} />
        ) : error ? (
          <ErrorState
            message={error}
            onRetry={loadHistorial}
            isMobile
          />
        ) : trips.length === 0 ? (
          <EmptyState isMobile onNavigate={onNavigate} />
        ) : (
          <HistoryList
            trips={trips}
            isMobile
            onReportIssue={onReportIssue}
          />
        )}

        <BottomNav active="trips" onNavigate={onNavigate} />
      </div>
    </div>
  )
}
