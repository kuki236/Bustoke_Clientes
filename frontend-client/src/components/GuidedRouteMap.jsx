import { ExternalLink, MapPin, Navigation } from 'lucide-react'

function buildGoogleMapsUrl(destination, { travelMode = 'driving' } = {}) {
  const encoded = encodeURIComponent(destination || '')
  return `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=${travelMode}`
}

// Embed de Google Maps.

function GoogleMapsEmbed({ query, className = '' }) {
  if (!query) return null
  const src = `https://maps.google.com/maps?q=${encodeURIComponent(
    query,
  )}&output=embed&z=15`
  return (
    <iframe
      title={`Mapa de Google Maps hacia ${query}`}
      src={src}
      className={`w-full h-full border-0 ${className}`}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen
    />
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
  address,
  className = '',
}) {
// FIX BUG-154: el query del mapa debe ser la dirección específica

  const query = address || destinationName || origin
  return (
    <div className="flex flex-col gap-1">
      <div
        className={`h-56 w-full rounded-xl overflow-hidden relative border border-neutral-200 shadow-inner bg-slate-100 ${className}`}
        role="region"
        aria-label={`Mapa de Google Maps hacia ${query || embarque || 'el embarque'}`}
      >
        {query ? (
          <GoogleMapsEmbed query={query} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-neutral-500 p-4 text-center">
            Selecciona un viaje para ver la ruta hacia el terminal.
          </div>
        )}
      </div>
      <GoogleMapsActions destination={query} embarque={embarque} />
    </div>
  )
}

export function GuidedRouteHeader({ embarque }) {
  return (
    <p className="text-[10px] font-semibold text-neutral-700 flex items-center gap-1">
      <MapPin className="w-3 h-3 text-blue-600" aria-hidden="true" />
      Ruta hacia el terminal de embarque
      {embarque ? <> · <span className="text-blue-600">{embarque}</span></> : null}
    </p>
  )
}
