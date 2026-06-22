import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Bus,
  CircleCheck,
  Download,
  MapPin,
  Share2,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import Navbar from './Navbar'
import BottomNav from './BottomNav'
import Alert from './Alert'
import { useAuth } from '../context/AuthContext'

const DEFAULT_DATE = '15/06/2026'
const PAYMENT_METHOD_LABEL = {
  yape: 'Yape / Plin',
  plin: 'Yape / Plin',
  tarjeta: 'Tarjeta de crédito/débito',
}

function formatNumber(value) {
  if (value === null || value === undefined) return '0.00'
  const n = Number(value)
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}

function getPaymentMethodLabel(method) {
  if (!method) return '—'
  return PAYMENT_METHOD_LABEL[method] || method
}

function DesktopSuccessBanner() {
  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="bg-green-100 text-green-700 rounded-xl flex items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-3">
          <CircleCheck className="w-6 h-6 shrink-0" strokeWidth={2.25} />
          <p className="text-sm sm:text-base font-semibold leading-tight">
            ¡Pago exitoso! Tu viaje está confirmado.
          </p>
        </div>
      </div>
      <p className="text-center text-sm text-neutral-600 mt-3">
        Tu reserva está confirmada. Te enviamos una copia a tu correo.
      </p>
    </div>
  )
}

function QrBlock({ value }) {
  if (!value) return null
  return (
    <div
      className="flex flex-col items-center gap-1.5"
      aria-label={`Código QR ${value}`}
    >
      <QRCodeSVG
        value={`http://192.168.1.50:8000/v1/boletos/validar/${value}`}
        size={112}
        className="p-1 bg-white rounded-md border border-slate-200"
      />
      <span className="font-mono text-[10px] text-neutral-700 text-center break-all leading-tight max-w-[7rem]">
        {value}
      </span>
    </div>
  )
}

function TicketCard({ boleto, pasajeroLabel }) {
  return (
    <article className="bg-white border border-neutral-200 rounded-2xl p-5 flex flex-col gap-4 shadow-card">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
            <Bus className="w-4 h-4" />
          </span>
          <div className="flex flex-col">
            <span className="text-xs text-neutral-500">Asiento</span>
            <span className="text-base font-semibold text-neutral-900">
              {boleto.numeroAsiento}
            </span>
          </div>
        </div>
        <QrBlock value={boleto.codigoQr} />
      </header>
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="flex flex-col">
          <span className="text-xs text-neutral-500">Pasajero</span>
          <span className="font-medium text-neutral-900">
            {pasajeroLabel || boleto.pasajero}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-neutral-500">Precio</span>
          <span className="font-medium text-neutral-900">
            S/ {formatNumber(boleto.precioFinal)}
          </span>
        </div>
      </div>
    </article>
  )
}

function SummaryBlock({ summary, trip, date, paymentMethod }) {
  if (!summary) return null
  return (
    <article className="bg-white rounded-2xl shadow-card p-6 flex flex-col gap-4">
      <h2 className="text-lg font-bold text-neutral-900">Resumen de la compra</h2>

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">Código de reserva</span>
          <span className="font-mono font-semibold text-neutral-900">
            {summary.codigoReserva}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">Estado</span>
          <span className="font-semibold text-green-700 capitalize">
            {summary.estado || 'confirmada'}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">Ruta</span>
          <span className="font-medium text-neutral-900">
            {trip?.origin || 'Origen'} → {trip?.destination || 'Destino'}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">Empresa</span>
          <span className="font-medium text-neutral-900">
            {trip?.company || '—'}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">Fecha</span>
          <span className="font-medium text-neutral-900">{date || DEFAULT_DATE}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">Hora</span>
          <span className="font-medium text-neutral-900">
            {trip?.departureTime || '—'}
          </span>
        </div>
      </div>

      <div className="h-px bg-neutral-200" />

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">Método de pago</span>
          <span className="font-medium text-neutral-900">
            {getPaymentMethodLabel(
              summary.pago?.metodo || paymentMethod,
            )}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">Referencia</span>
          <span className="font-mono text-xs text-neutral-700 break-all">
            {summary.pago?.referenciaTransaccion || '—'}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">Estado del pago</span>
          <span className="font-medium text-neutral-900 capitalize">
            {summary.pago?.estado || 'completado'}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">Total pagado</span>
          <span className="font-semibold text-neutral-900 text-lg">
            S/ {formatNumber(summary.total ?? summary.pago?.montoTotal)}
          </span>
        </div>
      </div>
    </article>
  )
}

function EmptyBookingState({ onHome }) {
  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-6">
      <div className="max-w-md bg-white rounded-2xl shadow-card p-8 text-center flex flex-col gap-4">
        <h1 className="text-lg font-semibold text-neutral-900">
          No encontramos una reserva activa
        </h1>
        <p className="text-sm text-neutral-600">
          Vuelve a los resultados para iniciar una nueva compra.
        </p>
        <button
          type="button"
          onClick={onHome}
          className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-blue-700 self-center"
        >
          Volver al inicio
        </button>
      </div>
    </div>
  )
}

export default function CheckoutSuccessPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated } = useAuth()
  const { bookingResult, trip, date, paymentMethod } =
    location.state || {}

  const [shareNotice, setShareNotice] = useState('')
  const [showCopiedToast, setShowCopiedToast] = useState(false)

  useEffect(() => {
    if (!shareNotice) return undefined
    const timer = setTimeout(() => setShareNotice(''), 3500)
    return () => clearTimeout(timer)
  }, [shareNotice])

  useEffect(() => {
    if (!showCopiedToast) return undefined
    const timer = setTimeout(() => setShowCopiedToast(false), 3000)
    return () => clearTimeout(timer)
  }, [showCopiedToast])

  const summary = useMemo(() => {
    if (!bookingResult) return null
    return {
      codigoReserva: bookingResult.codigoReserva,
      estado: bookingResult.estado,
      total: bookingResult.total,
      pago: bookingResult.pago,
      boletos: bookingResult.boletos || [],
    }
  }, [bookingResult])

  const handleHome = () => navigate('/')
  const handleTrips = () => navigate('/?tab=mis-viajes')
  const handleShare = async () => {
    if (!summary) return

    const infoViaje = {
      origen: trip?.origin || 'Origen',
      destino: trip?.destination || 'Destino',
      empresa: trip?.company || '—',
      fecha: date || DEFAULT_DATE,
    }

    const asientosAgrupados = (summary.boletos || [])
      .map((b) => b.numeroAsiento)
      .filter(Boolean)
      .join(', ')

    const textoCompartir =
      `🚌 *¡Mis Pasajes en Bustoke!* 🚌\n\n` +
      `📍 *Ruta:* ${infoViaje.origen} → ${infoViaje.destino}\n` +
      `🏢 *Empresa:* ${infoViaje.empresa}\n` +
      `📅 *Fecha:* ${infoViaje.fecha}\n` +
      `💺 *Asientos:* ${asientosAgrupados}\n\n` +
      `Presenta tus códigos QR en el counter del terrapuerto antes del embarque. ¡Buen viaje!`

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(textoCompartir)
        setShowCopiedToast(true)
      }
    } catch {
      // Copia silenciosa: si el navegador bloquea el portapapeles,
      // seguimos intentando abrir el menú nativo o mostraremos el
      // aviso de confirmación en el fallback.
      setShowCopiedToast(true)
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: 'Boletos Bustoke',
          text: textoCompartir,
        })
      } else {
        alert('¡Información del viaje copiada al portapapeles con éxito!')
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setShareNotice(
          'No pudimos generar el mensaje. Inténtalo nuevamente en unos segundos.',
        )
      }
    }
  }

  if (!summary) {
    return <EmptyBookingState onHome={handleHome} />
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      {shareNotice && (
        <div
          className="fixed left-1/2 top-4 z-50 w-[min(92vw,420px)] -translate-x-1/2"
          aria-live="polite"
        >
          <Alert variant="success" className="shadow-lg">
            {shareNotice}
          </Alert>
        </div>
      )}
      {showCopiedToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2 z-50 animate-bounce">
          <span>📋 ¡Información de viaje copiada al portapapeles!</span>
        </div>
      )}
      <div className="hidden md:block">
        <Navbar onNavigate={(tab) => navigate(`/?tab=${tab}`)} active="buscar" />
        <div className="max-w-5xl mx-auto px-8 py-10 flex flex-col gap-6">
          <DesktopSuccessBanner />

          <SummaryBlock
            summary={summary}
            trip={trip}
            date={date}
            paymentMethod={paymentMethod}
          />

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-neutral-900">
              Tus boletos ({summary.boletos.length})
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {summary.boletos.map((boleto) => (
                <TicketCard key={boleto.idBoleto} boleto={boleto} />
              ))}
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <MapPin className="w-4 h-4" />
              <span>Presenta tu QR en el counter antes del embarque.</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center gap-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 px-5 py-2.5 rounded-md font-medium text-sm"
              >
                <Share2 className="w-4 h-4" />
                Compartir
              </button>
              {isAuthenticated ? (
                <>
                  <button
                    type="button"
                    onClick={handleHome}
                    className="inline-flex items-center gap-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 px-5 py-2.5 rounded-md font-medium text-sm"
                  >
                    Volver al inicio
                  </button>
                  <button
                    type="button"
                    onClick={handleTrips}
                    className="inline-flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 font-medium px-5 py-2.5 rounded-md text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Ver mis viajes
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleHome}
                  className="inline-flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 font-medium px-5 py-2.5 rounded-md text-sm"
                >
                  Volver al inicio
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="block md:hidden pb-28">
        <header className="bg-blue-600 text-white p-5 text-center">
          <p className="text-3xl font-bold tracking-wide">
            {summary.codigoReserva}
          </p>
          <p className="text-xs text-white/80 mt-1">
            Código de reserva · {summary.boletos.length} boletos
          </p>
        </header>

        <main className="flex flex-col gap-4 p-4">
          <SummaryBlock
            summary={summary}
            trip={trip}
            date={date}
            paymentMethod={paymentMethod}
          />

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-bold text-neutral-900">
              Tus boletos
            </h2>
            {summary.boletos.map((boleto) => (
              <TicketCard key={boleto.idBoleto} boleto={boleto} />
            ))}
          </section>
        </main>

        <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-neutral-200 px-4 py-3 z-40 shadow-lg">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleHome}
              className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700"
            >
              Volver al inicio
            </button>
            {isAuthenticated ? (
              <button
                type="button"
                onClick={handleTrips}
                className="flex-1 py-3 rounded-xl border border-neutral-200 text-neutral-700 font-semibold text-sm hover:bg-neutral-50"
              >
                Mis viajes
              </button>
            ) : (
              <button
                type="button"
                onClick={handleShare}
                className="flex-1 py-3 rounded-xl border border-neutral-200 text-neutral-700 font-semibold text-sm hover:bg-neutral-50 inline-flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-4 h-4" />
                Compartir
              </button>
            )}
          </div>
        </div>

        <BottomNav active="buscar" onNavigate={(tab) => navigate(`/?tab=${tab}`)} />
      </div>
    </div>
  )
}
