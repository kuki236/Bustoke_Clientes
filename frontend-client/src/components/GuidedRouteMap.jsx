import { ExternalLink, MapPin, Navigation } from 'lucide-react'

function buildGoogleMapsUrl(destination, { travelMode = 'driving' } = {}) {
  const encoded = encodeURIComponent(destination || '')
  return `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=${travelMode}`
}

function MapSimulation({ embarque }) {
  return (
    <>
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'linear-gradient(to right, #cbd5e1 1px, transparent 1px), linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute top-1/4 left-0 right-0 h-0.5 bg-slate-300"
        aria-hidden="true"
      />
      <div
        className="absolute top-3/4 left-0 right-0 h-0.5 bg-slate-300"
        aria-hidden="true"
      />
      <div
        className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-300"
        aria-hidden="true"
      />

      <div
        className="absolute left-6 right-12 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-blue-500"
        aria-hidden="true"
      />

      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-10">
        <span
          className="bg-blue-600 w-3 h-3 rounded-full shadow-md ring-4 ring-blue-600/20"
          aria-hidden="true"
        />
        <span className="text-[10px] font-semibold text-neutral-900 bg-white/95 px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
          Tu ubicación
        </span>
      </div>

      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-10">
        <div className="relative">
          <span
            className="absolute inset-0 rounded-full bg-red-500/30 animate-ping"
            aria-hidden="true"
          />
          <MapPin
            className="w-7 h-7 text-red-600 fill-red-600 animate-bounce relative"
            aria-hidden="true"
          />
        </div>
        <span className="text-[10px] font-semibold text-neutral-900 bg-white/95 px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
          {embarque}
        </span>
      </div>
    </>
  )
}

function GuidedRouteLegend({ embarque, origin }) {
  return (
    <div
      className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm rounded-lg p-2 shadow-sm border border-neutral-100 max-w-[180px] z-10"
    >
      <p className="text-[10px] text-neutral-700 leading-snug">
        <span className="font-semibold text-blue-600">Indicación visual</span>:
        abajo abre la ruta real en Google Maps.
      </p>
      {origin ? (
        <p className="text-[9px] text-neutral-500 mt-0.5 truncate">
          {origin} · {embarque}
        </p>
      ) : null}
    </div>
  )
}

function GoogleMapsActions({ destination, embarque }) {
  if (!destination) return null
  const drivingUrl = buildGoogleMapsUrl(destination, { travelMode: 'driving' })
  const transitUrl = buildGoogleMapsUrl(destination, { travelMode: 'transit' })
  const walkingUrl = buildGoogleMapsUrl(destination, { travelMode: 'walking' })

  return (
    <div className="mt-2 flex flex-col gap-2">
      <a
        href={drivingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
      >
        <Navigation className="w-4 h-4" />
        Abrir ruta en Google Maps
        <ExternalLink className="w-3.5 h-3.5 opacity-80" />
      </a>
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-neutral-500">
        <span>O también:</span>
        <a
          href={walkingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline font-medium"
        >
          A pie
        </a>
        <span>·</span>
        <a
          href={transitUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline font-medium"
        >
          Transporte público
        </a>
      </div>
      <p className="text-[10px] text-neutral-400 text-center">
        Destino: <span className="font-medium text-neutral-600">{destination}</span>
        {embarque ? <> · Rampa {embarque}</> : null}
      </p>
    </div>
  )
}

export default function GuidedRouteMap({
  embarque,
  origin,
  destinationName,
  className = '',
}) {
  const destination = destinationName || origin
  return (
    <div className="flex flex-col gap-1">
      <div
        data-map-mode={destination ? 'google-maps' : 'simulated'}
        className={`h-48 w-full rounded-xl overflow-hidden relative border border-neutral-200 shadow-inner bg-slate-100 ${className}`}
        role="region"
        aria-label={`Mapa de ruta hacia ${destination || embarque || 'el embarque'}`}
      >
        <MapSimulation embarque={embarque} />
        <GuidedRouteLegend embarque={embarque} origin={origin} />
      </div>
      <GoogleMapsActions destination={destination} embarque={embarque} />
    </div>
  )
}

export function GuidedRouteHeader({ embarque }) {
  return (
    <p className="text-[10px] font-semibold text-neutral-700 flex items-center gap-1">
      <Navigation className="w-3 h-3 text-blue-600" aria-hidden="true" />
      Ruta hacia Terminal de Salida →{' '}
      <span className="text-blue-600">{embarque}</span>
    </p>
  )
}
