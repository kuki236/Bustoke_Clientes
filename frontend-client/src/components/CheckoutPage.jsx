import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, CreditCard, Smartphone, UserCircle2, X } from 'lucide-react'
import Navbar from './Navbar'
import BottomNav from './BottomNav'
import Alert from './Alert'
import LocalCardPaymentForm from './LocalCardPaymentForm'
import { processBookingRequest } from '../api/bookings'
import { createCardPayment } from '../api/payments'
import { useAuth } from '../context/AuthContext'

const DOC_TYPES = ['DNI', 'CE', 'Pasaporte']
const DEFAULT_DOC_TYPE = 'DNI'
const DEFAULT_DATE = '15/06/2026'
const SEAT_SESSION_TOKEN_KEY = 'bustoke_seat_session_token'
const CHECKOUT_SEATS_STORAGE_KEY = 'bustoke_checkout_seats_full'
const RESERVATION_SECONDS = 600
const ALERT_THRESHOLD_SECONDS = 120
const USE_LOCAL_CARD_FORM = (() => {
  try {
    return import.meta.env.VITE_USE_LOCAL_CARD_FORM !== 'false'
  } catch {
    return true
  }
})()
const MERCADOPAGO_PUBLIC_KEY = 'TEST-88efe7f4-0a0c-4126-b47c-f4318c4fa72f'

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
      aria-labelledby="checkout-reservation-expired-title"
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
            id="checkout-reservation-expired-title"
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

const DOC_TYPE_TO_ID = {
  DNI: 1,
  Pasaporte: 2,
  CE: 3,
}

const PAYMENT_METHOD_TO_BACKEND = {
  card: 'tarjeta',
  yape: 'yape',
}

const PAYMENT_METHODS = [
  {
    id: 'card',
    label: 'Tarjeta de Crédito/Débito',
    logos: [
      { label: 'VISA', color: 'text-blue-700' },
      { label: 'MC', color: 'text-orange-600' },
    ],
    icon: CreditCard,
  },
  {
    id: 'yape',
    label: 'Yape/Plin',
    logos: [
      { label: 'Yape', color: 'text-fuchsia-600' },
      { label: 'Plin', color: 'text-cyan-600' },
    ],
    icon: Smartphone,
  },
]

function formatSeat(seatId) {
  return seatId.split('-').slice(1).join('-')
}

function buildExternalReference({ idViaje, tokenSesion, passengersCount }) {
  // Lo usa Mercado Pago como `external_reference` para reconciliar
  // el pago con la reserva. Formato: BOOKING:<idViaje>:<token>:<pax>
  const id = idViaje ?? 'NA'
  const tok = tokenSesion ? String(tokenSesion).slice(0, 40) : 'NA'
  const n = Number(passengersCount) || 0
  return `BOOKING:${id}:${tok}:${n}`
}

function getEmptyPassenger(seat) {
  return {
    seat,
    docType: DEFAULT_DOC_TYPE,
    docNumber: '',
    names: '',
    paternalSurname: '',
    maternalSurname: '',
    fechaNacimiento: '',
  }
}

function getEmptyBuyer() {
  return {
    email: '',
    fullName: '',
  }
}

function splitFullName(fullName) {
  if (!fullName) return { names: '', paternalSurname: '', maternalSurname: '' }
  const tokens = String(fullName)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (tokens.length === 0) {
    return { names: '', paternalSurname: '', maternalSurname: '' }
  }
  if (tokens.length === 1) {
    return { names: tokens[0], paternalSurname: '', maternalSurname: '' }
  }
  if (tokens.length === 2) {
    return { names: tokens[0], paternalSurname: tokens[1], maternalSurname: '' }
  }
  return {
    names: tokens.slice(0, -2).join(' '),
    paternalSurname: tokens[tokens.length - 2],
    maternalSurname: tokens[tokens.length - 1],
  }
}

function buyerFromUser(user) {
  if (!user) return getEmptyBuyer()
  return {
    email: String(user.email ?? user.correo ?? '').trim(),
  }
}

function passengerFromUser(user) {
  if (!user) return null
  const pick = (...keys) => {
    for (const k of keys) {
      if (user[k] !== undefined && user[k] !== null && user[k] !== '') {
        return user[k]
      }
    }
    return ''
  }
  return {
    docType: pick('docType', 'tipoDocumento', 'tipo_documento') || 'DNI',
    docNumber: String(
      pick('docNumber', 'numeroDocumento', 'numero_documento'),
    ).trim(),
    names: String(pick('names', 'nombres')).trim(),
    paternalSurname: String(
      pick('paternalSurname', 'apellidoPaterno', 'apellido_paterno'),
    ).trim(),
    maternalSurname: String(
      pick('maternalSurname', 'apellidoMaterno', 'apellido_materno'),
    ).trim(),
  }
}

function readSessionToken() {
  try {
    return sessionStorage.getItem(SEAT_SESSION_TOKEN_KEY)
  } catch {
    return null
  }
}

function clearSessionToken() {
  try {
    sessionStorage.removeItem(SEAT_SESSION_TOKEN_KEY)
  } catch {
    // ignore (modo privado, sin storage, etc.)
  }
}

function readCheckoutSeatsFromStorage() {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_SEATS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function clearCheckoutSeatsStorage() {
  try {
    sessionStorage.removeItem(CHECKOUT_SEATS_STORAGE_KEY)
  } catch {
    // ignore (modo privado, sin storage, etc.)
  }
}

function buildSeatIdMap(selectedSeatsFull) {
  const map = new Map()
  for (const seat of selectedSeatsFull || []) {
    if (seat?.numero_asiento != null && seat?.id_asiento != null) {
      map.set(String(seat.numero_asiento), Number(seat.id_asiento))
    }
  }
  return map
}

function buildBookingPayload({
  idViaje,
  tokenSesion,
  buyer,
  passengers,
  seatIdMap,
  paymentMethod,
  acceptedTerms = false,
  mpPaymentId = null,
  cardFormData = null,
  buyerIsPax1 = true,
}) {
  const metodoPago = PAYMENT_METHOD_TO_BACKEND[paymentMethod] || 'tarjeta'
  const firstPax = passengers[0] || {}

// FIX UX: derivar los datos de identidad del comprador sin

  let docType, docNumber, names, paternalSurname, maternalSurname

  if (buyerIsPax1) {
    docType = firstPax.docType || 'DNI'
    docNumber = String(firstPax.docNumber || '').trim()
    names = String(firstPax.names || '').trim()
    paternalSurname = String(firstPax.paternalSurname || '').trim()
    maternalSurname = String(firstPax.maternalSurname || '').trim()
  } else {
    // El DNI lo trae el Brick (payer.identification). El nombre lo
    // trae buyer.fullName (un solo campo, se parte en nombres/apellidos).
    const idType = cardFormData?.payer?.identification?.type
    const idNumber = cardFormData?.payer?.identification?.number
    docType = idType || 'DNI'
    docNumber = String(idNumber || '').trim()
    const split = splitFullName(buyer.fullName || '')
    names = split.names
    paternalSurname = split.paternalSurname
    maternalSurname = split.maternalSurname
  }

  return {
    token_sesion: tokenSesion,
    id_viaje: idViaje,
    comprador: {
      tipo_documento: docType,
      numero_documento: docNumber,
      nombres: names,
      apellidos: `${paternalSurname} ${maternalSurname}`.trim(),
      email: String(buyer.email || '').trim(),
    },
    pasajeros: passengers.map((pax) => ({
      id_asiento: seatIdMap.get(pax.seat),
      id_tipo_documento: DOC_TYPE_TO_ID[pax.docType] || 1,
      numero_documento: String(pax.docNumber || '').trim(),
      nombres: String(pax.names || '').trim(),
      apellido_paterno: String(pax.paternalSurname || '').trim(),
      apellido_materno: String(pax.maternalSurname || '').trim(),
      fecha_nacimiento: pax.fechaNacimiento,
    })),
    metodo_pago: metodoPago,
// FIX BUG-111: enviar explícitamente la aceptación de términos.

    acepto_terminos_politicas: Boolean(acceptedTerms),
    // ID del Payment de Mercado Pago cuando el método es tarjeta.
    // El backend lo usa como referencia_transaccion ("MP-<id>").
    mp_payment_id: mpPaymentId || undefined,
  }
}

function validateCheckoutForm({ buyer, passengers, buyerIsPax1 = true }) {
  const errors = []
  if (!buyer.email?.trim()) errors.push('Correo del comprador')
  if (!buyerIsPax1 && !buyer.fullName?.trim()) {
    errors.push('Nombre completo del titular del pago')
  }

  passengers.forEach((pax, i) => {
    const label = `Pasajero ${i + 1} (asiento ${pax.seat})`
    if (!pax.docNumber?.trim()) errors.push(`${label}: número de documento`)
    if (!pax.names?.trim()) errors.push(`${label}: nombres`)
    if (!pax.paternalSurname?.trim()) errors.push(`${label}: apellido paterno`)
    if (!pax.maternalSurname?.trim()) errors.push(`${label}: apellido materno`)
    if (!pax.fechaNacimiento?.trim()) errors.push(`${label}: fecha de nacimiento`)
  })

  return errors
}

function Checkbox({ id, checked, onChange, children, tone = 'default' }) {
  const toneClasses =
    tone === 'subtle'
      ? 'text-neutral-600 hover:text-neutral-800'
      : 'text-neutral-700'
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-2.5 text-sm cursor-pointer select-none ${toneClasses}`}
    >
      <span className="relative shrink-0 mt-0.5">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
            checked ? 'bg-blue-600 border-blue-600' : 'bg-white border-neutral-400'
          }`}
          aria-hidden="true"
        >
          {checked && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3.5 h-3.5 text-white"
            >
              <path d="M5 12l5 5L20 7" />
            </svg>
          )}
        </span>
      </span>
      <span className="leading-snug">{children}</span>
    </label>
  )
}

function SelectField({ label, value, onChange, options, id, disabled = false }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-sm font-medium text-neutral-900"
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`w-full appearance-none px-3 py-2.5 pr-9 border border-neutral-400 rounded-lg text-sm text-neutral-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            disabled
              ? 'bg-neutral-100 !border-neutral-200 text-neutral-500 cursor-not-allowed select-none'
              : ''
          }`}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
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
      </div>
    </div>
  )
}

function InputField({ label, value, onChange, placeholder, type = 'text', id, disabled = false }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-sm font-medium text-neutral-900"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-3 py-2.5 border border-neutral-400 rounded-lg text-sm text-neutral-900 placeholder:text-neutral-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          disabled
            ? 'bg-neutral-100 !border-neutral-200 text-neutral-500 cursor-not-allowed select-none'
            : ''
        }`}
      />
    </div>
  )
}

function PassengerAccordionItem({
  index,
  passenger,
  expanded,
  onToggleExpand,
  onChange,
  showUseProfileCheckbox = false,
  useProfileForPax1 = false,
  onToggleUseProfileForPax1,
  hasProfileData = false,
}) {
  const update = (field, value) => {
    onChange(index, { ...passenger, [field]: value })
  }
  const isComplete =
    passenger.docNumber?.trim() &&
    passenger.names?.trim() &&
    passenger.paternalSurname?.trim() &&
    passenger.maternalSurname?.trim() &&
    passenger.fechaNacimiento?.trim()

  return (
    <section
      className={`flex flex-col gap-4 ${
        index > 0 ? 'pt-6 border-t border-neutral-200' : ''
      }`}
    >
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        aria-controls={`pax-panel-${index}`}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <h3 className="text-base font-semibold text-neutral-900">
          Pasajero {index + 1} — Asiento {passenger.seat}
          {!expanded && !isComplete && (
            <span className="text-neutral-500 font-normal text-sm">
              {' '}
              (Completar datos)
            </span>
          )}
        </h3>
        <span
          className={`text-neutral-500 text-sm transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        >
          ▼
        </span>
      </button>

      <div
        id={`pax-panel-${index}`}
        className={`grid transition-all duration-300 ease-in-out ${
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden flex flex-col gap-4">
          {showUseProfileCheckbox && onToggleUseProfileForPax1 && (
            <div className="-mt-1 mb-1 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-100">
              <Checkbox
                id="use-profile-pax1"
                checked={useProfileForPax1}
                onChange={onToggleUseProfileForPax1}
                tone="subtle"
              >
                <span className="flex items-center gap-1.5 flex-wrap">
                  <UserCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    Usar mis datos de perfil para el Pasajero 1
                    {!hasProfileData && (
                      <span className="text-neutral-500">
                        {' '}
                        (perfil incompleto)
                      </span>
                    )}
                  </span>
                </span>
              </Checkbox>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            <SelectField
              id={`pax-${index}-docType`}
              label="Tipo de Documento"
              value={passenger.docType}
              onChange={(v) => update('docType', v)}
              options={DOC_TYPES}
              disabled={useProfileForPax1}
            />
            <InputField
              id={`pax-${index}-docNumber`}
              label="Número de Documento"
              value={passenger.docNumber}
              onChange={(v) => update('docNumber', v)}
              placeholder="Ej. 74872562"
              disabled={useProfileForPax1}
            />
          </div>
          <InputField
            id={`pax-${index}-names`}
            label="Nombres"
            value={passenger.names}
            onChange={(v) => update('names', v)}
            placeholder="Ej. Juan Carlos"
            disabled={useProfileForPax1}
          />
          <div className="grid sm:grid-cols-2 gap-4">
            <InputField
              id={`pax-${index}-paternal`}
              label="Apellido Paterno"
              value={passenger.paternalSurname}
              onChange={(v) => update('paternalSurname', v)}
              placeholder="Ej. Pérez"
              disabled={useProfileForPax1}
            />
            <InputField
              id={`pax-${index}-maternal`}
              label="Apellido Materno"
              value={passenger.maternalSurname}
              onChange={(v) => update('maternalSurname', v)}
              placeholder="Ej. Mendoza"
              disabled={useProfileForPax1}
            />
          </div>
          <InputField
            id={`pax-${index}-birth`}
            label="Fecha de Nacimiento"
            type="date"
            value={passenger.fechaNacimiento}
            onChange={(v) => update('fechaNacimiento', v)}
            max="2010-12-31"
// FIX UX: solo bloqueamos la fecha de nacimiento si el

          />
        </div>
      </div>
    </section>
  )
}

function BuyerBlock({
  buyer,
  onChange,
  buyerIsPax1,
  onToggleBuyerIsPax1,
  isLoggedIn = false,
  buyerReadOnlyReason = null,
}) {
  const update = (field, value) => {
    onChange({ ...buyer, [field]: value })
  }
  const emailLocked = isLoggedIn && Boolean(buyer.email)

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-neutral-900">
          Email de contacto
        </h3>
        {isLoggedIn && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1 rounded-full">
            <UserCircle2 className="w-3.5 h-3.5" />
            Sesión iniciada
          </span>
        )}
      </div>

      <Checkbox
        id="buyer-is-pax1"
        checked={buyerIsPax1}
        onChange={onToggleBuyerIsPax1}
      >
        El comprador es el Pasajero 1
      </Checkbox>

      {buyerReadOnlyReason && (
        <p className="text-xs text-neutral-500 -mt-2">{buyerReadOnlyReason}</p>
      )}

      <InputField
        id="buyer-email"
        label="Correo Electrónico"
        type="email"
        value={buyer.email}
        onChange={(v) => update('email', v)}
        placeholder="correo@ejemplo.com"
        disabled={emailLocked}
      />

      {!buyerIsPax1 && (
        <>
          <InputField
            id="buyer-fullName"
            label="Nombre completo del titular del pago"
            value={buyer.fullName || ''}
            onChange={(v) => update('fullName', v)}
            placeholder="Ej. Juan Carlos Pérez Mendoza"
          />
          <p className="text-xs text-neutral-500 -mt-1">
            Su DNI se tomará de la sección de la tarjeta de crédito al
            momento de pagar.
          </p>
        </>
      )}
    </section>
  )
}

function PaymentOption({ option, selected, onSelect }) {
  const Icon = option.icon
  return (
    <label
      className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
        selected
          ? 'border-blue-600 bg-blue-50'
          : 'border-neutral-200 bg-white hover:border-neutral-400'
      }`}
    >
      <input
        type="radio"
        name="paymentMethod"
        value={option.id}
        checked={selected}
        onChange={() => onSelect(option.id)}
        className="sr-only"
      />
      <span
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
          selected ? 'border-blue-600' : 'border-neutral-400'
        }`}
        aria-hidden="true"
      >
        {selected && <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
      </span>
      <Icon className={`w-5 h-5 shrink-0 ${selected ? 'text-blue-600' : 'text-neutral-500'}`} />
      <span className="flex-1 text-sm font-medium text-neutral-900">
        {option.label}
      </span>
      <div className="flex items-center gap-1.5">
        {option.logos.map((logo) => (
          <span
            key={logo.label}
            className={`text-[10px] font-bold tracking-wide px-1.5 py-0.5 bg-white border border-neutral-200 rounded ${logo.color}`}
          >
            {logo.label}
          </span>
        ))}
      </div>
    </label>
  )
}

function SummaryCard({ trip, selectedSeats, total, date }) {
// FIX bug "Cannot read properties of null (reading 'origin')":

  const safeTrip = trip && typeof trip === 'object' ? trip : {}
  const displaySeats = Array.isArray(selectedSeats)
    ? selectedSeats.map(formatSeat)
    : []
  const displayDate = date || DEFAULT_DATE
  return (
    <article className="bg-white rounded-2xl shadow-card p-6 flex flex-col gap-4">
      <h2 className="text-lg font-bold text-neutral-900">Resumen de Compra</h2>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-neutral-600">Ruta</p>
        <p className="text-base font-semibold text-neutral-900 leading-tight">
          {safeTrip.origin || '—'} a {safeTrip.destination || '—'}
        </p>
        {displaySeats.length > 0 && (
          <p className="text-sm text-neutral-700 break-words">
            <span className="text-neutral-500">Asientos: </span>
            <span className="font-medium text-neutral-900">
              {displaySeats.join(', ')}
            </span>
          </p>
        )}
      </div>

      <div className="h-px bg-neutral-200" />

      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-neutral-600">Empresa</dt>
          <dd className="font-medium text-neutral-900 text-right">
            {safeTrip.company || '—'}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-neutral-600">Fecha</dt>
          <dd className="font-medium text-neutral-900 text-right">{displayDate}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-neutral-600">Hora</dt>
          <dd className="font-medium text-neutral-900 text-right">
            {safeTrip.departureTime || '—'}
          </dd>
        </div>
      </dl>

      <div className="h-px bg-neutral-200" />

      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-600">Total</span>
        <span className="text-2xl font-bold text-neutral-900">
          S/ {Number(total || 0).toFixed(2)}
        </span>
      </div>
    </article>
  )
}

function TermsCheckbox({ checked, onChange, id }) {
  return (
    <label
      htmlFor={id}
      className="flex items-start gap-3 cursor-pointer text-sm text-neutral-700"
    >
      <span className="relative shrink-0 mt-0.5">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
            checked
              ? 'bg-blue-600 border-blue-600'
              : 'bg-white border-neutral-400'
          }`}
          aria-hidden="true"
        >
          {checked && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3.5 h-3.5 text-white"
            >
              <path d="M5 12l5 5L20 7" />
            </svg>
          )}
        </span>
      </span>
      <span>
        Acepto los{' '}
        <span className="text-blue-600 font-medium">Términos y Condiciones</span>{' '}
        y la{' '}
        <span className="text-blue-600 font-medium">Política de Privacidad</span>.
      </span>
    </label>
  )
}

function CheckoutForms({
  passengers,
  buyer,
  onChangePassenger,
  onChangeBuyer,
  expandedPax,
  onToggleExpandPax,
  buyerIsPax1,
  onToggleBuyerIsPax1,
  isLoggedIn = false,
  useProfileForPax1 = false,
  onToggleUseProfileForPax1,
  hasProfileData = false,
  buyerReadOnlyReason = null,
}) {
  return (
    <div className="flex flex-col gap-6">
      <article className="bg-white rounded-2xl shadow-card p-6 flex flex-col gap-6">
        <h2 className="text-lg font-bold text-neutral-900">
          Datos de los pasajeros
        </h2>
        <div className="flex flex-col gap-6">
          {passengers.map((pax, i) => (
            <PassengerAccordionItem
              key={`${pax.seat}-${i}`}
              index={i}
              passenger={pax}
              expanded={expandedPax.includes(i)}
              onToggleExpand={() => onToggleExpandPax(i)}
              onChange={onChangePassenger}
              showUseProfileCheckbox={isLoggedIn && i === 0}
              useProfileForPax1={isLoggedIn && i === 0 ? useProfileForPax1 : false}
              onToggleUseProfileForPax1={onToggleUseProfileForPax1}
              hasProfileData={hasProfileData}
            />
          ))}
        </div>
      </article>

      <article className="bg-white rounded-2xl shadow-card p-6 flex flex-col gap-6">
        <BuyerBlock
          buyer={buyer}
          onChange={onChangeBuyer}
          buyerIsPax1={buyerIsPax1}
          onToggleBuyerIsPax1={onToggleBuyerIsPax1}
          isLoggedIn={isLoggedIn}
          buyerReadOnlyReason={buyerReadOnlyReason}
        />
      </article>
    </div>
  )
}

function PaymentMethodsCard({ paymentMethod, onSelectPayment }) {
  return (
    <article className="bg-white rounded-2xl shadow-card p-6 flex flex-col gap-4">
      <h2 className="text-lg font-bold text-neutral-900">Métodos de pago</h2>
      <div className="flex flex-col gap-3">
        {PAYMENT_METHODS.map((option) => (
          <PaymentOption
            key={option.id}
            option={option}
            selected={paymentMethod === option.id}
            onSelect={onSelectPayment}
          />
        ))}
      </div>
    </article>
  )
}

function CardPaymentBrickContainer({
  amount,
  payerEmail,
  cardholderName,
  externalReference,
  onSubmit,
  onError,
  onReady,
}) {
  const reactId = useId()
// FIX mobile/PC: `brickNonce` se incluye en el `containerId` para

  const [brickNonce, setBrickNonce] = useState(0)
  // FIX mobile/PC: estado de error expuesto en UI para mostrar un
  // botón "Reintentar" cuando los Secure Fields fallan.
  const [loadError, setLoadError] = useState(false)
  const containerId = `cardPaymentBrick_container_${reactId.replace(
    /[^a-zA-Z0-9_-]/g,
    '',
  )}_${brickNonce}`
  const containerRef = useRef(null)
  const controllerRef = useRef(null)
// Guardamos los callbacks en refs para que el `useEffect` no se

  const onSubmitRef = useRef(onSubmit)
  const onErrorRef = useRef(onError)
  const onReadyRef = useRef(onReady)
// FIX Bug MercadoPago Brick + React 18+ StrictMode:

  const initializedRef = useRef(false)

  useEffect(() => {
    onSubmitRef.current = onSubmit
    onErrorRef.current = onError
    onReadyRef.current = onReady
  }, [onSubmit, onError, onReady])

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    setLoadError(false)
    if (typeof window === 'undefined' || !window.MercadoPago) {
      console.error(
        '[MP] SDK de Mercado Pago no cargada. Verifica el <script> en index.html.',
      )
      setLoadError(true)
      initializedRef.current = false
      return
    }

// FIX brick vacío (sin console message): ELIMINADO el setTimeout

    try {
      const mp = new window.MercadoPago(MERCADOPAGO_PUBLIC_KEY, {
        locale: 'es-PE',
// FIX submit error: dejamos `advancedFraudPrevention` en su

      })
      const bricksBuilder = mp.bricks()

      const settings = {
        initialization: {
          amount: Number(amount) || 0,
          payer: {
            email: payerEmail || '',
// FIX UX: pre-rellenamos el nombre del titular con el

            ...(cardholderName ? { firstName: cardholderName } : {}),
          },
        },
        customization: {
          visual: {
            style: { theme: 'default' },
          },
          paymentMethods: {
            maxInstallments: 1,
          },
        },
        callbacks: {
          onReady: () => {
            onReadyRef.current?.()
          },
          onSubmit: async (cardFormData) => {
            try {
              const enriched = {
                ...cardFormData,
                transactionAmount: Number(amount) || 0,
                externalReference,
              }
              await onSubmitRef.current?.(enriched)
            } catch (err) {
              console.error('[MP] onSubmit error', err)
              throw err
            }
          },
          onError: (error) => {
// FIX debug: extraemos todas las propiedades del error,

            const detail = {
              cause: error?.cause,
              message: error?.message,
              type: error?.type,
              allKeys: error ? Object.keys(error) : [],
            }
            console.error('[MP] onError DETALLE', detail)

// FIX get_card_bin_payment_methods_failed:

            if (
              error?.cause === 'get_card_bin_payment_methods_failed' ||
              error?.message === 'get_card_bin_payment_methods_failed'
            ) {
              console.warn(
                '[MP] BIN lookup falló (no crítico). El usuario puede ' +
                  'igual intentar pagar. Causa probable: sandbox de MP ' +
                  'inestable o tarjeta no reconocida.',
              )
              return
            }

// FIX UX: si MP reporta este error específico,

            if (error?.cause === 'secure_fields_card_token_creation_failed') {
              const hint =
                'No pudimos tokenizar la tarjeta. Causas comunes: ' +
                '(1) un bloqueador de contenido (uBlock, AdGuard, ' +
                'Privacy Badger) está bloqueando el iframe de pago; ' +
                '(2) la tarjeta no es de prueba del sandbox; ' +
                '(3) los campos no están completos. ' +
                'Desactiva bloqueadores para checkout.bustoke y reintenta.'
              onErrorRef.current?.({
                ...error,
                userMessage: hint,
              })
              return
            }
            onErrorRef.current?.(error)
          },
        },
      }

      bricksBuilder
        .create('cardPayment', containerId, settings)
        .then((controller) => {
          controllerRef.current = controller
        })
        .catch((err) => {
          // FIX mobile/PC: si falla la creación, exponemos el error
          // en UI para que el usuario pueda reintentar.
          console.error('[MP] No se pudo crear el Card Payment Brick', err)
          initializedRef.current = false
          setLoadError(true)
        })
    } catch (err) {
// FIX mobile/PC: capturamos errores SÍNCRONOS (inicialización

      console.error('[MP] Error síncrono al crear el Brick', err)
      initializedRef.current = false
      setLoadError(true)
    }

// NO cleanup aquí. El Brick se desmonta implícitamente cuando

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId])

// FIX mobile: handler de retry que fuerza un re-mount limpio

  const handleRetry = useCallback(() => {
    if (controllerRef.current) {
      try {
        controllerRef.current.unmount()
      } catch (e) {
        // ignorar
      }
      controllerRef.current = null
    }
    initializedRef.current = false
    setLoadError(false)
    setBrickNonce((n) => n + 1)
  }, [])

  return (
    <div className="flex flex-col gap-3">
      {loadError ? (
        <div
          className="border border-amber-300 bg-amber-50 rounded-xl p-4 flex flex-col gap-3"
          role="alert"
        >
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-amber-900">
              No se pudo cargar el formulario de pago
            </p>
            <p className="text-xs text-amber-800 leading-relaxed">
              Esto puede deberse a un bloqueador de contenido, a la
              extensión de tu navegador o a un problema temporal del
              proveedor.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            className="self-start px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors"
          >
            Reintentar carga
          </button>
        </div>
      ) : null}
      <div
        ref={containerRef}
        id={containerId}
        className="mercadopago-brick-container"
        data-testid="card-payment-brick"
        style={{
          minHeight: loadError ? 0 : 350,
// FIX mobile tap en vencimiento / CVC: MP inyecta iframes

          position: 'relative',
          zIndex: 1,
// FIX mobile: en iOS Safari, los iframes dentro de un

          touchAction: 'manipulation',
        }}
      />
    </div>
  )
}

function PaymentPanel({
  paymentMethod,
  onSelectPayment,
  acceptedTerms,
  onToggleTerms,
  total,
  onPay,
  isProcessing = false,
  payError = null,
  payerEmail = '',
  onPayerEmailChange = () => {},
  cardholderName = '',
  externalReference = '',
  onBrickReady = () => {},
  onBrickError = () => {},
}) {
  const isCard = paymentMethod === 'card'
  return (
    <div className="flex flex-col gap-6">
      <PaymentMethodsCard
        paymentMethod={paymentMethod}
        onSelectPayment={onSelectPayment}
      />

      <div className="flex flex-col gap-4">
        <div className="px-1">
          <TermsCheckbox
            id="terms-desktop"
            checked={acceptedTerms}
            onChange={onToggleTerms}
          />
        </div>
        {payError && <Alert variant="error">{payError}</Alert>}

        {isCard ? (
          isProcessing ? (
            <div
              className="w-full py-3 rounded-xl font-medium bg-neutral-200 text-neutral-600 text-center"
              role="status"
              aria-live="polite"
            >
              Procesando pago con Mercado Pago...
            </div>
          ) : USE_LOCAL_CARD_FORM ? (
            <LocalCardPaymentForm
              amount={total}
              payerEmail={payerEmail}
              onEmailChange={onPayerEmailChange}
              cardholderName={cardholderName}
              externalReference={externalReference}
              onSubmit={onPay}
              onReady={onBrickReady}
              onError={onBrickError}
            />
          ) : (
            <CardPaymentBrickContainer
              amount={total}
              payerEmail={payerEmail}
              cardholderName={cardholderName}
              externalReference={externalReference}
              onSubmit={onPay}
              onReady={onBrickReady}
              onError={onBrickError}
            />
          )
        ) : (
          <button
            type="button"
            onClick={onPay}
            disabled={!acceptedTerms || isProcessing}
            className={`w-full py-3 rounded-xl font-medium transition-colors ${
              acceptedTerms && !isProcessing
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
            }`}
          >
            {isProcessing
              ? 'Procesando pago seguro...'
              : `Pagar S/ ${total.toFixed(2)}`}
          </button>
        )}
      </div>
    </div>
  )
}

export default function CheckoutPage({
  trip: tripProp,
  selectedSeats: selectedSeatsProp,
  selectedSeatsFull: selectedSeatsFullProp = [],
  total: totalProp,
  date: dateProp,
  idViaje: idViajeProp,
  onBack,
  onPaymentSuccess,
  onNavigate,
}) {
  const location = useLocation()
  const navigate = useNavigate()
// NOTA: `location.state` es un objeto nuevo en cada render. Los

  const stateData = location.state || {}

  const trip = stateData.trip ?? tripProp ?? null
  const selectedSeats = Array.isArray(stateData.selectedSeats)
    ? stateData.selectedSeats
    : Array.isArray(selectedSeatsProp)
      ? selectedSeatsProp
      : []

  const selectedSeatsFullFromState = Array.isArray(stateData.selectedSeatsFull)
    ? stateData.selectedSeatsFull
    : []
  const selectedSeatsFullFromProps = Array.isArray(selectedSeatsFullProp)
    ? selectedSeatsFullProp
    : []

  let selectedSeatsFull = selectedSeatsFullFromState.length
    ? selectedSeatsFullFromState
    : selectedSeatsFullFromProps

// FIX bug "el hold no coincide con el asiento del booking": el

  if (selectedSeatsFull.length === 0) {
    const fallbackSeats = readCheckoutSeatsFromStorage()
    if (fallbackSeats.length > 0) {
      console.warn(
        '[Checkout] selectedSeatsFull no vino en location.state; ' +
          'recuperando respaldo desde sessionStorage.',
        {
          key: CHECKOUT_SEATS_STORAGE_KEY,
          count: fallbackSeats.length,
          idAsientos: fallbackSeats.map((s) => s.id_asiento),
        },
      )
      selectedSeatsFull = fallbackSeats
    }
  }

  const total =
    Number(stateData.total ?? totalProp) || 0
  const date = stateData.date ?? dateProp ?? ''
  const idViaje =
    stateData.idViaje ?? idViajeProp ?? (trip?.id ? Number(trip.id) : null)

  const seatIdMap = useMemo(
    () => buildSeatIdMap(selectedSeatsFull),
    [selectedSeatsFull],
  )

  useEffect(() => {
    if (selectedSeats.length === 0 || selectedSeatsFull.length === 0) {
      console.error(
        '[Checkout] Estado de router inválido: no hay asientos seleccionados.',
        { selectedSeats, selectedSeatsFull },
      )
      navigate('/', { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [passengers, setPassengers] = useState(() =>
    selectedSeats.map((s) => getEmptyPassenger(formatSeat(s))),
  )
  const { user, isAuthenticated } = useAuth()
  const profileBuyer = useMemo(
    () => (isAuthenticated ? buyerFromUser(user) : getEmptyBuyer()),
    [isAuthenticated, user],
  )
// FIX: datos del perfil que se copian a Pasajero 1 cuando el

  const profilePassenger = useMemo(
    () => (isAuthenticated ? passengerFromUser(user) : null),
    [isAuthenticated, user],
  )
  const hasProfileData = useMemo(() => {
    if (!isAuthenticated || !profilePassenger) return false
    return Boolean(
      profilePassenger.docNumber ||
        profilePassenger.names ||
        profilePassenger.paternalSurname,
    )
  }, [isAuthenticated, profilePassenger])
  const [buyer, setBuyer] = useState(() =>
    isAuthenticated ? { ...profileBuyer } : getEmptyBuyer(),
  )
  const [paymentMethod, setPaymentMethod] = useState('card')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [payError, setPayError] = useState(null)
  const [expandedPax, setExpandedPax] = useState(() =>
    selectedSeats.length > 0 ? [0] : [],
  )
  const [buyerIsPax1, setBuyerIsPax1] = useState(true)
  const [useProfileForPax1, setUseProfileForPax1] = useState(false)
  const [timeLeft, setTimeLeft] = useState(
    selectedSeats.length > 0 ? RESERVATION_SECONDS : null,
  )
  const [showExpiredModal, setShowExpiredModal] = useState(false)
  const expiredHandledRef = useRef(false)

  const handleToggleExpandPax = useCallback((index) => {
    setExpandedPax((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    )
  }, [])

  const handleToggleBuyerIsPax1 = useCallback((checked) => {
    // FIX UX: el buyer ya no guarda doc/nombres; esos se derivan
    // de Pasajero 1 en `handlePay`. Solo toggeleamos el flag.
    setBuyerIsPax1(checked)
  }, [])

  const handleToggleUseProfileForPax1 = useCallback(
    (checked) => {
      setUseProfileForPax1(checked)
      if (checked && passengers[0] && profilePassenger) {
        const p0 = passengers[0]
        setPassengers((prev) =>
          prev.map((p, i) =>
            i === 0
              ? {
                  ...p,
                  docType: profilePassenger.docType || p.docType,
                  docNumber: profilePassenger.docNumber || p.docNumber,
                  names: profilePassenger.names || p.names,
                  paternalSurname:
                    profilePassenger.paternalSurname || p.paternalSurname,
                  maternalSurname:
                    profilePassenger.maternalSurname || p.maternalSurname,
// fechaNacimiento NO se copia del perfil: el registro

                }
              : p,
          ),
        )
        setExpandedPax((prev) => (prev.includes(0) ? prev : [...prev, 0]))
      }
    },
    [passengers, profilePassenger],
  )

  const buyerReadOnlyReason = isAuthenticated
    ? 'Estos datos vienen de tu perfil y se usarán para emitir el comprobante.'
    : null

// FIX UX: nombre del titular de la tarjeta para pre-rellenar el Brick.

  const resolveCardholderName = useCallback(() => {
    if (buyerIsPax1) {
      const p0 = passengers[0]
      if (!p0) return ''
      return [p0.names, p0.paternalSurname, p0.maternalSurname]
        .filter(Boolean)
        .join(' ')
        .trim()
    }
    return String(buyer?.fullName || '').trim()
  }, [buyerIsPax1, passengers, buyer])

// FIX message_channel_error: memoizamos `externalReference` para

  const externalReferenceValue = useMemo(
    () =>
      buildExternalReference({
        idViaje: idViaje ?? (trip?.id ? Number(trip.id) : null),
        tokenSesion: readSessionToken(),
        passengersCount: passengers.length,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idViaje, trip?.id, passengers.length],
  )

  useEffect(() => {
    if (selectedSeats.length === 0) {
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
  }, [selectedSeats.length, timeLeft])

  useEffect(() => {
    if (timeLeft === 0 && selectedSeats.length > 0 && !expiredHandledRef.current) {
      expiredHandledRef.current = true
      setShowExpiredModal(true)
    }
  }, [timeLeft, selectedSeats.length])

  const handleAcceptExpired = useCallback(() => {
    setShowExpiredModal(false)
    setTimeLeft(null)
    expiredHandledRef.current = false
    clearSessionToken()
    clearCheckoutSeatsStorage()
    if (idViaje) {
      navigate(`/viaje/${idViaje}/asientos`, { replace: true })
    } else {
      navigate('/', { replace: true })
    }
  }, [idViaje, navigate])

  const handleBack = useCallback(() => {
    if (typeof onBack === 'function') {
      onBack()
      return
    }
    if (idViaje) {
// FIX bug "Resumen de Compra muestra guiones":

      navigate(`/viaje/${idViaje}/asientos`, {
        state: {
          trip,
          origin: stateData.origin,
          destination: stateData.destination,
          company: stateData.company,
          departureTime: stateData.departureTime,
          date,
          idViaje,
          searchValues: stateData.searchValues,
        },
      })
    } else {
      navigate(-1)
    }
  }, [onBack, idViaje, navigate, trip, date, stateData])

  const handleChangePassenger = (index, updated) => {
    setPassengers((prev) => prev.map((p, i) => (i === index ? updated : p)))
  }

  const handlePay = async (cardFormData = null) => {
    const tokenSesion = readSessionToken()

    if (isProcessing) {
      console.warn('[Checkout] handlePay ignorado: ya hay un pago en proceso')
      return
    }

    if (!acceptedTerms) {
      console.error(
        '[Checkout] handlePay bloqueado: el usuario no aceptó los términos',
      )
      setPayError('Debes aceptar los términos y condiciones.')
      // Cuando viene del Brick, lanzamos para que muestre error inline
      // y no quede en estado "cargando" para siempre.
      if (cardFormData) throw new Error('Debes aceptar los términos y condiciones.')
      return
    }

    if (!tokenSesion) {
      console.error(
        '[Checkout] handlePay bloqueado: token_sesion es undefined. ' +
          `Verifica que sessionStorage tenga la clave "${SEAT_SESSION_TOKEN_KEY}".`,
      )
      setPayError(
        'Tu sesión de bloqueo expiró. Vuelve al mapa de asientos y reintenta.',
      )
      if (cardFormData) throw new Error('Tu sesión de bloqueo expiró.')
      return
    }

    const validationErrors = validateCheckoutForm({ buyer, passengers, buyerIsPax1 })
    if (validationErrors.length > 0) {
      console.error(
        '[Checkout] Validación de formulario incompleta',
        { buyer, passengers, validationErrors },
      )
      const msg = `Completa los campos obligatorios: ${validationErrors.join(', ')}.`
      setPayError(msg)
      if (cardFormData) throw new Error(msg)
      return
    }

    const missingSeats = passengers.filter(
      (pax) => !seatIdMap.has(pax.seat),
    )
    if (missingSeats.length > 0) {
      console.error(
        '[Checkout] No se pudo mapear id_asiento para los pasajeros',
        {
          passengersSeats: passengers.map((p) => p.seat),
          missingSeats: missingSeats.map((p) => p.seat),
          seatIdMap: Array.from(seatIdMap.entries()),
          selectedSeatsFull,
        },
      )
      const msg = 'No pudimos mapear los asientos con la reserva. Vuelve al mapa de asientos.'
      setPayError(msg)
      if (cardFormData) throw new Error(msg)
      return
    }

    const resolvedIdViaje =
      idViaje ?? (trip?.id ? Number(trip.id) : null)
    if (!resolvedIdViaje) {
      console.error('[Checkout] idViaje no resuelto', { idViaje, trip })
      const msg = 'No se pudo identificar el viaje. Vuelve a los resultados.'
      setPayError(msg)
      if (cardFormData) throw new Error(msg)
      return
    }

    setIsProcessing(true)
    setPayError(null)

    let mpPaymentId = null
    if (cardFormData) {
      if (cardFormData.localPaymentId) {
        mpPaymentId = cardFormData.localPaymentId
      } else {
        const buyerFullName = [
          buyer.names,
          buyer.paternalSurname,
          buyer.maternalSurname,
        ]
          .filter(Boolean)
          .join(' ')
          .trim()
        const enrichedCardData = {
          ...cardFormData,
          cardholderName: cardFormData.cardholderName || buyerFullName || undefined,
          transactionAmount: Number(total) || 0,
          externalReference:
            cardFormData.externalReference ||
            `BOOKING:${resolvedIdViaje}:${tokenSesion}:${passengers.length}`,
        }

        try {
          const mpRes = await createCardPayment(enrichedCardData)
          if (!mpRes.approved) {
            const msg = mpRes.message || 'El pago fue rechazado por Mercado Pago.'
            setPayError(msg)
            throw new Error(msg)
          }
          mpPaymentId = mpRes.payment?.id || null
        } catch (err) {
          console.error('[Checkout] Error creando el pago en Mercado Pago', err)
          const msg =
            err?.message ||
            'No pudimos comunicarnos con Mercado Pago. Intenta nuevamente.'
          setPayError(msg)
          setIsProcessing(false)
          throw err
        }
      }
    }

    const payload = buildBookingPayload({
      idViaje: resolvedIdViaje,
      tokenSesion,
      buyer,
      passengers,
      seatIdMap,
      paymentMethod,
      acceptedTerms, // FIX BUG-111
      mpPaymentId,
      cardFormData,
      buyerIsPax1,
    })

    try {
      const result = await processBookingRequest(payload)

      clearSessionToken()
      clearCheckoutSeatsStorage()
      setPassengers([])
      setBuyer(getEmptyBuyer())
      setAcceptedTerms(false)
      setUseProfileForPax1(false)
      onPaymentSuccess?.({ passengers, buyer, paymentMethod })

      navigate('/checkout/success', {
        state: {
          bookingResult: result,
          trip,
          date,
          paymentMethod,
        },
      })
    } catch (err) {
      console.error(
        '[Checkout] Error en POST /v1/bookings/process',
        {
          message: err?.message,
          status: err?.status,
          err,
        },
      )
// FIX UX: cuando el backend devuelve 409 con un mensaje

      const isConflict = err?.status === 409
      const lowerMessage = String(err?.message || '').toLowerCase()
      const isStale =
        lowerMessage.includes('ya tiene un boleto activo') ||
        lowerMessage.includes('bloqueo activo')
      let msg
      if (isConflict && isStale) {
        msg =
          'Uno o más asientos ya fueron vendidos. Esto puede pasar ' +
          'si una compra anterior completó pero no pudiste ver la ' +
          'confirmación. Revisa "Mis Viajes" para ver si ya tienes ' +
          'estos boletos.'
      } else {
        msg =
          err?.message ||
          'No pudimos procesar el pago. Intenta nuevamente en unos minutos.'
      }
      setPayError(msg)
// Si el pago en MP ya fue aprobado y el booking falló, NO

      if (mpPaymentId) {
        msg += ` (Pago MP #${mpPaymentId} ya fue procesado. Si no ves tus boletos en "Mis Viajes", contáctanos indicando este número.)`
        setPayError(msg)
      }
      if (cardFormData) throw new Error(msg, { cause: err })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="hidden md:block">
        <Navbar
          onNavigate={onNavigate}
          active="buscar"
          timerSlot={<ReservationTimerBadge timeLeft={timeLeft} />}
        />
        <div className="max-w-7xl mx-auto p-8 flex flex-col gap-6">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-blue-600 transition-colors self-start"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al mapa de asientos
          </button>

          <div className="grid md:grid-cols-[1fr_400px] gap-8">
            <CheckoutForms
              passengers={passengers}
              buyer={buyer}
              onChangePassenger={handleChangePassenger}
              onChangeBuyer={setBuyer}
              expandedPax={expandedPax}
              onToggleExpandPax={handleToggleExpandPax}
              buyerIsPax1={buyerIsPax1}
              onToggleBuyerIsPax1={handleToggleBuyerIsPax1}
              isLoggedIn={isAuthenticated}
              useProfileForPax1={useProfileForPax1}
              onToggleUseProfileForPax1={handleToggleUseProfileForPax1}
              hasProfileData={hasProfileData}
              buyerReadOnlyReason={buyerReadOnlyReason}
            />

            <aside className="flex flex-col gap-6">
              <SummaryCard
                trip={trip}
                selectedSeats={selectedSeats}
                total={total}
                date={date}
              />
              <PaymentPanel
                paymentMethod={paymentMethod}
                onSelectPayment={setPaymentMethod}
                acceptedTerms={acceptedTerms}
                onToggleTerms={setAcceptedTerms}
                total={total}
                onPay={handlePay}
                isProcessing={isProcessing}
                payError={payError}
                payerEmail={buyer.email}
                onPayerEmailChange={(v) => setBuyer((b) => ({ ...b, email: v }))}
                cardholderName={resolveCardholderName()}
                externalReference={externalReferenceValue}
                onBrickReady={() => {}}
                onBrickError={(err) => {
                  console.error('[MP] Card Payment Brick error', err)
                  if (err?.userMessage) setPayError(err.userMessage)
                }}
              />
            </aside>
          </div>
        </div>
      </div>

      <div className="block md:hidden pb-16">
        <header className="bg-blue-600 text-white p-5 flex items-center gap-4">
          <button
            type="button"
            onClick={handleBack}
            aria-label="Volver al mapa de asientos"
            className="p-1 -ml-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-lg font-semibold leading-tight">
            Confirma y paga
          </h1>
        </header>

        <div className="px-4 -mt-6">
          <SummaryCard
            trip={trip}
            selectedSeats={selectedSeats}
            total={total}
            date={date}
          />
        </div>

        <main className="flex flex-col gap-4 p-4 pb-28">
          <article className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-6">
            <h2 className="text-base font-bold text-neutral-900">
              Datos de los pasajeros
            </h2>
            <div className="flex flex-col gap-6">
              {passengers.map((pax, i) => (
                <PassengerAccordionItem
                  key={`${pax.seat}-${i}`}
                  index={i}
                  passenger={pax}
                  expanded={expandedPax.includes(i)}
                  onToggleExpand={() => handleToggleExpandPax(i)}
                  onChange={handleChangePassenger}
                  showUseProfileCheckbox={isAuthenticated && i === 0}
                  useProfileForPax1={isAuthenticated && i === 0 ? useProfileForPax1 : false}
                  onToggleUseProfileForPax1={handleToggleUseProfileForPax1}
                  hasProfileData={hasProfileData}
                />
              ))}
            </div>
          </article>

          <article className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-6">
            <BuyerBlock
              buyer={buyer}
              onChange={setBuyer}
              buyerIsPax1={buyerIsPax1}
              onToggleBuyerIsPax1={handleToggleBuyerIsPax1}
              isLoggedIn={isAuthenticated}
              buyerReadOnlyReason={buyerReadOnlyReason}
            />
          </article>

          <article className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-4">
            <h2 className="text-base font-bold text-neutral-900">
              Métodos de pago
            </h2>
            <div className="flex flex-col gap-3">
              {PAYMENT_METHODS.map((option) => (
                <PaymentOption
                  key={option.id}
                  option={option}
                  selected={paymentMethod === option.id}
                  onSelect={setPaymentMethod}
                />
              ))}
            </div>
          </article>

          <div className="pt-2">
            <TermsCheckbox
              id="terms-mobile"
              checked={acceptedTerms}
              onChange={setAcceptedTerms}
            />
          </div>

          {payError && <Alert variant="error">{payError}</Alert>}

          {paymentMethod === 'card' ? (
            isProcessing ? (
              <div
                className="w-full py-3 rounded-xl font-medium bg-neutral-200 text-neutral-600 text-center"
                role="status"
                aria-live="polite"
              >
                Procesando pago con Mercado Pago...
              </div>
            ) : USE_LOCAL_CARD_FORM ? (
              <LocalCardPaymentForm
                amount={total}
                payerEmail={buyer.email}
                onEmailChange={(v) => setBuyer((b) => ({ ...b, email: v }))}
                cardholderName={resolveCardholderName()}
                externalReference={externalReferenceValue}
                onSubmit={handlePay}
                onReady={() => {}}
                onError={(err) => {
                  console.error('[CardForm] error (mobile)', err)
                  if (err?.userMessage) setPayError(err.userMessage)
                }}
              />
            ) : (
              <CardPaymentBrickContainer
                amount={total}
                payerEmail={buyer.email}
                cardholderName={resolveCardholderName()}
                externalReference={externalReferenceValue}
                onSubmit={handlePay}
                onReady={() => {}}
                onError={(err) => {
                  console.error('[MP] Card Payment Brick error (mobile)', err)
                  if (err?.userMessage) setPayError(err.userMessage)
                }}
              />
            )
          ) : null}
        </main>

        {paymentMethod !== 'card' && (
          <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-neutral-200 px-4 py-3 z-40 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="text-xs text-neutral-600">Total a pagar</span>
                <span className="text-lg font-bold text-neutral-900">
                  S/ {total.toFixed(2)}
                </span>
              </div>
              <button
                type="button"
                onClick={handlePay}
                disabled={!acceptedTerms || isProcessing}
                className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                  acceptedTerms && !isProcessing
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                }`}
              >
                {isProcessing
                  ? 'Procesando pago seguro...'
                  : `Pagar S/ ${total.toFixed(2)}`}
              </button>
            </div>
          </div>
        )}

        <BottomNav active="buscar" onNavigate={onNavigate} />
      </div>

      <ExpiredModal open={showExpiredModal} onAccept={handleAcceptExpired} />
    </div>
  )
}
