import {
  BookText,
  CircleCheckBig,
  ClipboardList,
  Loader2,
  MessageSquareWarning,
  Send,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchHistorialRequest } from '../api/boletos'
import { createClaimRequest } from '../api/claims'
import { AGENCIES } from '../data/agencies'
import { TIPOS_DOCUMENTO } from '../data/tiposDocumento'
import AvatarMenu from './AvatarMenu'
import BottomNav from './BottomNav'
import Navbar from './Navbar'

const TIPO_BIEN_OPTIONS = [
  { value: 'producto', label: 'Producto', helper: 'Compra del boleto en sí' },
  {
    value: 'servicio',
    label: 'Servicio',
    helper: 'Atención en rampa, demora del bus, etc.',
  },
]

const TRACKING_PREFIX = 'REC'
const TRACKING_CHARS = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'

function generateTrackingCode() {
  let code = ''
  for (let i = 0; i < 8; i += 1) {
    code += TRACKING_CHARS.charAt(
      Math.floor(Math.random() * TRACKING_CHARS.length),
    )
  }
  return `${TRACKING_PREFIX}-${code}`
}

function findAgencyIdByName(name) {
  if (!name) return ''
  const normalized = String(name).trim().toLowerCase()
  const match = AGENCIES.find(
    (a) => a.nombre.toLowerCase() === normalized,
  )
  return match ? String(match.id_agencia) : ''
}

function buildLinkedDetalle(trip) {
  if (!trip) return ''
  return `[Reclamo asociado al viaje con destino a ${trip.destination} de la fecha ${trip.date}. Cód. Reserva: ${trip.reservationCode}] - `
}

function FieldLabel({ htmlFor, children }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-xs font-semibold text-neutral-900 mb-1"
    >
      {children}
    </label>
  )
}

function TextField({
  id,
  name,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  readOnly = false,
  inputMode,
  autoComplete,
  required = false,
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={readOnly ? undefined : onChange}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        readOnly={readOnly}
        required={required}
        className={`w-full px-3 py-2.5 border rounded-xl text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          readOnly
            ? 'bg-neutral-50 border-neutral-200 text-neutral-600 cursor-not-allowed'
            : 'bg-white border-neutral-300'
        }`}
      />
    </div>
  )
}

function SelectField({
  id,
  name,
  label,
  value,
  onChange,
  options,
  placeholder,
  readOnly = false,
  required = false,
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <select
          id={id}
          name={name}
          value={value}
          onChange={readOnly ? undefined : onChange}
          disabled={readOnly}
          required={required}
          className={`w-full appearance-none px-3 py-2.5 pr-9 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            readOnly
              ? 'bg-neutral-50 border-neutral-200 text-neutral-600 cursor-not-allowed'
              : 'bg-white border-neutral-300 text-neutral-900'
          }`}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {!readOnly && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        )}
      </div>
    </div>
  )
}

function RadioOption({ name, value, option, selected, onChange }) {
  const isSelected = selected === value
  return (
    <label
      className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
        isSelected
          ? 'border-blue-600 bg-blue-50'
          : 'border-neutral-200 bg-white hover:border-neutral-400'
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={isSelected}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      <span
        className={`w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
          isSelected ? 'border-blue-600' : 'border-neutral-400'
        }`}
        aria-hidden="true"
      >
        {isSelected && (
          <span className="w-2 h-2 rounded-full bg-blue-600" />
        )}
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-semibold text-neutral-900">
          {option.label}
        </span>
        <span className="text-xs text-neutral-500 mt-0.5">
          {option.helper}
        </span>
      </span>
    </label>
  )
}

function SuccessBanner({ trackingCode, onDismiss }) {
  return (
    <div
      role="status"
      className="bg-green-100 text-green-700 border border-green-200 rounded-xl p-4 flex items-start gap-3"
    >
      <CircleCheckBig
        className="w-5 h-5 shrink-0 mt-0.5"
        strokeWidth={2.25}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">
          Reclamo registrado con éxito.
        </p>
        <p className="text-sm text-green-700/90 mt-1 leading-snug">
          Se ha enviado una copia con el número de seguimiento{' '}
          <span className="font-semibold">{trackingCode}</span> a su correo
          electrónico.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar mensaje"
        className="text-green-700/80 hover:text-green-900 text-sm font-semibold"
      >
        Cerrar
      </button>
    </div>
  )
}

function ClaimsForm({ onSubmitted, isDesktop = false, initial = {}, linkedTrip = null }) {
  const { isAuthenticated } = useAuth()
  const initialTipoDoc = (() => {
    const docType = initial?.tipo_documento || initial?.docType
    if (docType) {
      const match = TIPOS_DOCUMENTO.find(
        (t) => t.nombre === docType || String(t.id_tipo_documento) === String(docType),
      )
      if (match) return String(match.id_tipo_documento)
    }
    return '1'
  })()

  const buildInitialForm = () => ({
    nombres: initial?.nombres ?? initial?.names ?? '',
    apellido_paterno: initial?.apellido_paterno ?? initial?.paternalSurname ?? '',
    apellido_materno: initial?.apellido_materno ?? initial?.maternalSurname ?? '',
    email_contacto: initial?.email ?? '',
    id_tipo_documento: initialTipoDoc,
    numero_documento:
      initial?.numero_documento ?? initial?.docNumber ?? '',
    id_agencia:
      findAgencyIdByName(linkedTrip?.company) ||
      (initial?.id_agencia ? String(initial.id_agencia) : ''),
    tipo_bien: linkedTrip ? 'servicio' : 'producto',
    detalle: buildLinkedDetalle(linkedTrip),
  })

  const [form, setForm] = useState(buildInitialForm)
  const [acceptDeclaration, setAcceptDeclaration] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(null)

  // Selector opcional de "Vincular a un viaje": sólo cuando NO hay un
  // viaje ya vinculado desde Mis Viajes y el usuario está autenticado.
  const [userTrips, setUserTrips] = useState([])
  const [tripsLoading, setTripsLoading] = useState(false)
  const [selectedTripId, setSelectedTripId] = useState('')

  const effectiveTrip = linkedTrip || userTrips.find((t) => t.id === selectedTripId) || null
  const showTripSelector = !linkedTrip && isAuthenticated

  useEffect(() => {
    if (!showTripSelector) {
      setUserTrips([])
      setSelectedTripId('')
      return undefined
    }
    let cancelled = false
    setTripsLoading(true)
    fetchHistorialRequest()
      .then((items) => {
        if (cancelled) return
        setUserTrips(items)
      })
      .catch(() => {
        if (cancelled) return
        setUserTrips([])
      })
      .finally(() => {
        if (!cancelled) setTripsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [showTripSelector])

  useEffect(() => {
    setForm((prev) => ({
      ...buildInitialForm(),
      detalle: effectiveTrip ? prev.detalle || buildLinkedDetalle(effectiveTrip) : prev.detalle,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initial?.nombres,
    initial?.apellido_paterno,
    initial?.apellido_materno,
    initial?.email,
    initial?.numero_documento,
    initial?.tipo_documento,
    linkedTrip?.id,
  ])

  useEffect(() => {
    if (!success) return undefined
    const timer = setTimeout(() => setSuccess(null), 8000)
    return () => clearTimeout(timer)
  }, [success])

  const update = (field) => (e) => {
    const value = e?.target ? e.target.value : e
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSelectTrip = (tripId) => {
    setSelectedTripId(tripId)
    const trip = userTrips.find((t) => t.id === tripId)
    if (!trip) {
      setForm((prev) => ({
        ...prev,
        tipo_bien: 'producto',
        detalle: prev.detalle.replace(/^\[.*?\]\s*-\s*/, ''),
      }))
      return
    }
    setForm((prev) => ({
      ...prev,
      id_agencia: findAgencyIdByName(trip.company) || prev.id_agencia,
      tipo_bien: 'servicio',
      detalle: buildLinkedDetalle(trip),
    }))
  }

  const handleClearTrip = () => {
    setSelectedTripId('')
    setForm((prev) => ({
      ...prev,
      id_agencia: '',
      tipo_bien: 'producto',
      detalle: prev.detalle.replace(/^\[.*?\]\s*-\s*/, ''),
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const required = [
      ['nombres', 'Nombres'],
      ['apellido_paterno', 'Apellido Paterno'],
      ['apellido_materno', 'Apellido Materno'],
      ['numero_documento', 'Número de Documento'],
      ['email_contacto', 'Email de contacto'],
      ['id_agencia', 'Empresa de Transporte'],
      ['detalle', 'Detalle'],
    ]
    const missing = required
      .filter(([field]) => !String(form[field] ?? '').trim())
      .map(([, label]) => label)
    if (missing.length > 0) {
      setError(`Completa los campos: ${missing.join(', ')}.`)
      return
    }
    if (form.detalle.trim().length < 15) {
      setError('El detalle debe tener al menos 15 caracteres.')
      return
    }
    if (!acceptDeclaration) {
      setError('Debes aceptar la declaración para enviar el reclamo.')
      return
    }
    setSubmitting(true)
    try {
      const created = await createClaimRequest({
        id_agencia: form.id_agencia,
        motivo: form.detalle.split(/\r?\n/, 1)[0]?.slice(0, 150) || 'Reclamo',
        detalle: form.detalle,
        tipo_bien: form.tipo_bien,
      })
      const tracking = `REC-${String(created.id_reclamo).padStart(6, '0')}`
      setSuccess(tracking)
      onSubmitted?.({
        ...form,
        trackingCode: tracking,
        id_usuario: initial?.id_usuario ?? initial?.id ?? null,
        email_contacto: form.email_contacto,
        id_viaje: effectiveTrip?.idViaje ?? null,
        id_boleto: effectiveTrip?.idBoleto ?? null,
        id_reclamo: created.id_reclamo,
      })
      setForm((prev) => ({
        ...prev,
        detalle: effectiveTrip ? buildLinkedDetalle(effectiveTrip) : '',
        id_agencia:
          findAgencyIdByName(effectiveTrip?.company) || prev.id_agencia,
      }))
      setAcceptDeclaration(false)
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        'No se pudo registrar el reclamo. Intenta de nuevo.'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-6 w-full"
    >
      {success && (
        <SuccessBanner
          trackingCode={success}
          onDismiss={() => setSuccess(null)}
        />
      )}

      {linkedTrip && (
        <div
          className="bg-blue-50 text-blue-700 border border-blue-100 rounded-xl p-4 flex items-start gap-3"
          role="note"
        >
          <span
            className="w-8 h-8 rounded-lg bg-white text-blue-600 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <MessageSquareWarning className="w-4 h-4" />
          </span>
          <div className="flex flex-col min-w-0">
            <p className="text-sm font-semibold leading-tight">
              Reclamo vinculado al viaje {linkedTrip.origin} →{' '}
              {linkedTrip.destination} ({linkedTrip.company})
            </p>
            <p className="text-xs text-blue-700/80 mt-1 leading-snug">
              Empresa, tipo de bien y detalle se autocompletaron con la
              información del viaje. Puedes editarlos antes de enviar.
            </p>
          </div>
        </div>
      )}

      <section className="flex flex-col gap-4">
        <header className="flex items-center gap-2">
          <span
            className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"
            aria-hidden="true"
          >
            <BookText className="w-4 h-4" />
          </span>
          <h2 className="text-base font-bold text-neutral-900">
            1. Identificación del Consumidor
          </h2>
        </header>

        <p className="text-xs text-neutral-500 -mt-1">
          Estos datos se precargan desde tu cuenta. Puedes editarlos si
          necesitas corregirlos.
        </p>

        <TextField
          id="nombres"
          name="nombres"
          label="Nombres"
          value={form.nombres}
          onChange={update('nombres')}
          placeholder="Ej. Juan Carlos"
          autoComplete="given-name"
          required
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField
            id="apellido_paterno"
            name="apellido_paterno"
            label="Apellido Paterno"
            value={form.apellido_paterno}
            onChange={update('apellido_paterno')}
            placeholder="Ej. Pérez"
            autoComplete="family-name"
            required
          />
          <TextField
            id="apellido_materno"
            name="apellido_materno"
            label="Apellido Materno"
            value={form.apellido_materno}
            onChange={update('apellido_materno')}
            placeholder="Ej. García"
            autoComplete="family-name"
            required
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            id="id_tipo_documento"
            name="id_tipo_documento"
            label="Tipo de Documento"
            value={form.id_tipo_documento}
            onChange={update('id_tipo_documento')}
            options={TIPOS_DOCUMENTO.map((t) => ({
              value: String(t.id_tipo_documento),
              label: t.nombre,
            }))}
          />
          <TextField
            id="numero_documento"
            name="numero_documento"
            label="Número de Documento"
            value={form.numero_documento}
            onChange={update('numero_documento')}
            placeholder="Ingresa tu número"
            inputMode="numeric"
            autoComplete="off"
            required
          />
        </div>
        <TextField
          id="email_contacto"
          name="email_contacto"
          label="Email de Contacto"
          value={form.email_contacto}
          onChange={update('email_contacto')}
          placeholder="tucorreo@ejemplo.com"
          type="email"
          autoComplete="email"
          required
        />
      </section>

      <div className="h-px bg-neutral-100" />

      <section className="flex flex-col gap-4">
        <header className="flex items-center gap-2">
          <span
            className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"
            aria-hidden="true"
          >
            <MessageSquareWarning className="w-4 h-4" />
          </span>
          <h2 className="text-base font-bold text-neutral-900">
            2. Detalle de la Reclamación
          </h2>
        </header>

        {showTripSelector && (
          <div className="flex flex-col gap-2 p-4 bg-blue-50/60 border border-blue-100 rounded-xl">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-neutral-900">
                  Vincular a un viaje (opcional)
                </span>
                <span className="text-[11px] text-neutral-600 mt-0.5">
                  Si el reclamo es sobre un viaje específico, selecciónalo
                  para autocompletar la empresa.
                </span>
              </div>
              {selectedTripId && (
                <button
                  type="button"
                  onClick={handleClearTrip}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 px-2 py-1 rounded-lg hover:bg-white/60 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Quitar
                </button>
              )}
            </div>
            <div className="relative">
              <select
                id="linked_trip"
                name="linked_trip"
                value={selectedTripId}
                onChange={(e) => handleSelectTrip(e.target.value)}
                className="w-full appearance-none px-3 py-2.5 pr-9 border border-blue-200 rounded-xl text-sm text-neutral-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={tripsLoading}
              >
                <option value="">
                  {tripsLoading
                    ? 'Cargando tus viajes...'
                    : 'Reclamo general (sin viaje asociado)'}
                </option>
                {userTrips.map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {trip.company} · {trip.origin} → {trip.destination} ·{' '}
                    {trip.date} {trip.departureTime}
                  </option>
                ))}
              </select>
              {tripsLoading ? (
                <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-blue-600 animate-spin" />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              )}
            </div>
            {userTrips.length === 0 && !tripsLoading && (
              <p className="text-[11px] text-neutral-500">
                Aún no tienes viajes contratados. Puedes enviar el reclamo de
                todas formas.
              </p>
            )}
          </div>
        )}

        <SelectField
          id="id_agencia"
          name="id_agencia"
          label="Empresa de Transporte"
          value={form.id_agencia}
          onChange={update('id_agencia')}
          placeholder="Selecciona una empresa"
          options={AGENCIES.map((a) => ({
            value: String(a.id_agencia),
            label: `${a.nombre} · ${a.razon_social}`,
          }))}
          required
        />

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-neutral-900">
            Tipo de Bien
          </span>
          <div className="grid sm:grid-cols-2 gap-3">
            {TIPO_BIEN_OPTIONS.map((option) => (
              <RadioOption
                key={option.value}
                name="tipo_bien"
                value={option.value}
                option={option}
                selected={form.tipo_bien}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, tipo_bien: value }))
                }
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="detalle">Detalle</FieldLabel>
          <textarea
            id="detalle"
            name="detalle"
            value={form.detalle}
            onChange={update('detalle')}
            placeholder="Describa detalladamente los hechos de su reclamo o queja..."
            rows={6}
            className="w-full min-h-[120px] border border-neutral-200 rounded-xl p-3 text-sm text-neutral-900 placeholder:text-neutral-400 bg-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
      </section>

      <div className="h-px bg-neutral-100" />

      <section className="flex flex-col gap-4">
        <header className="flex items-center gap-2">
          <span
            className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"
            aria-hidden="true"
          >
            <ClipboardList className="w-4 h-4" />
          </span>
          <h2 className="text-base font-bold text-neutral-900">
            3. Envío y Confirmación
          </h2>
        </header>

        <label
          htmlFor="declaracion"
          className="flex items-start gap-2 text-sm text-neutral-700 cursor-pointer"
        >
          <input
            id="declaracion"
            name="declaracion"
            type="checkbox"
            checked={acceptDeclaration}
            onChange={(e) => setAcceptDeclaration(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-neutral-400 text-blue-600 accent-blue-600"
          />
          <span>
            Declaro ser el titular del servicio y acepto que los datos
            consignados son verdaderos.
          </span>
        </label>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <div
          className={`flex ${isDesktop ? 'justify-end' : 'w-full'}`}
        >
          <button
            type="submit"
            disabled={submitting}
            className={`inline-flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-medium transition-colors ${
              submitting
                ? 'bg-blue-600/70 text-white cursor-wait'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            } ${isDesktop ? '' : 'w-full'}`}
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Enviando reclamo…' : 'Enviar Reclamación'}
          </button>
        </div>
      </section>
    </form>
  )
}

export default function ClaimsPage({ onNavigate, onBack, linkedTrip = null }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth()

  const initial = (() => {
    if (isAuthenticated && user) {
      return {
        nombres: user.nombres,
        apellido_paterno: user.apellido_paterno,
        apellido_materno: user.apellido_materno,
        tipo_documento: user.tipo_documento,
        numero_documento: user.numero_documento,
        email: user.email,
        id_usuario: user.id_usuario ?? user.id ?? null,
      }
    }
    return {}
  })()

  const formKey = `${linkedTrip?.id ?? 'no-trip'}-${user?.id_usuario ?? 'anon'}`

  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="hidden md:block">
        <Navbar onNavigate={onNavigate} active="perfil" />
        <div className="max-w-3xl mx-auto p-8 mt-6">
          <article className="bg-white rounded-2xl shadow-card p-8 border border-neutral-100 flex flex-col gap-6">
            <header className="flex flex-col gap-2">
              <h1 className="text-3xl font-bold text-neutral-900">
                Libro de Reclamaciones
              </h1>
              <p className="text-sm text-neutral-600 leading-relaxed">
                Conforme a lo establecido en el Código de Protección y Defensa
                del Consumidor, nuestra plataforma cuenta con un Libro de
                Reclamaciones a su disposición.
              </p>
            </header>
            <div className="h-px bg-neutral-100" />
            <ClaimsForm
              key={formKey}
              isDesktop
              onBack={onBack}
              initial={initial}
              linkedTrip={linkedTrip}
            />
          </article>
        </div>
      </div>

      <div className="block md:hidden pb-24">
        <div className="bg-blue-600 text-white p-5 flex items-center gap-3 relative">
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver"
            className="p-1 -ml-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <h1 className="flex-1 text-lg font-semibold leading-tight">
            Libro de Reclamaciones
          </h1>
          {isAuthenticated && user && (
            <div className="absolute right-3 top-3">
              <AvatarMenu
                user={user}
                onNavigate={onNavigate}
                variant="light"
              />
            </div>
          )}
        </div>

        <main className="p-5 mb-20 flex flex-col gap-6">
          <p className="text-xs text-neutral-600 leading-relaxed">
            Conforme a lo establecido en el Código de Protección y Defensa del
            Consumidor, nuestra plataforma cuenta con un Libro de
            Reclamaciones a su disposición.
          </p>
          <ClaimsForm
            key={formKey}
            initial={initial}
            onBack={onBack}
            linkedTrip={linkedTrip}
          />
        </main>

        <BottomNav active="perfil" onNavigate={onNavigate} />
      </div>
    </div>
  )
}
