import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, CreditCard, Smartphone, UserCircle2, X } from 'lucide-react'
import Navbar from './Navbar'
import BottomNav from './BottomNav'
import Alert from './Alert'
import { processBookingRequest } from '../api/bookings'
import { useAuth } from '../context/AuthContext'

const DOC_TYPES = ['DNI', 'CE', 'Pasaporte']
const DEFAULT_DOC_TYPE = 'DNI'
const DEFAULT_DATE = '15/06/2026'
const SEAT_SESSION_TOKEN_KEY = 'bustoke_seat_session_token'
const CHECKOUT_SEATS_STORAGE_KEY = 'bustoke_checkout_seats_full'
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
    docType: DEFAULT_DOC_TYPE,
    docNumber: '',
    names: '',
    paternalSurname: '',
    maternalSurname: '',
    email: '',
  }
}

function normalizeDocType(raw) {
  if (!raw) return DEFAULT_DOC_TYPE
  const value = String(raw).trim().toUpperCase()
  if (value === 'DNI' || value === '1') return 'DNI'
  if (value === 'PASAPORTE' || value === '2') return 'Pasaporte'
  if (value === 'CE' || value === 'CARNET DE EXTRANJERIA' || value === '3') {
    return 'CE'
  }
  return DEFAULT_DOC_TYPE
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
  const explicitNames = [
    user.nombres,
    user.names,
    user.name,
  ].find((v) => v && String(v).trim())
  const split = explicitNames
    ? { names: String(explicitNames).trim(), paternalSurname: '', maternalSurname: '' }
    : splitFullName(
        [user.nombre, user.full_name, user.fullName]
          .find((v) => v && String(v).trim()) || '',
      )
  const paternal = [
    user.apellido_paterno,
    user.apellidoPaterno,
    user.paternal_surname,
    user.apellidoPaternoRaw,
  ].find((v) => v && String(v).trim())
  const maternal = [
    user.apellido_materno,
    user.apellidoMaterno,
    user.maternal_surname,
    user.apellidoMaternoRaw,
  ].find((v) => v && String(v).trim())
  return {
    docType: normalizeDocType(
      user.tipo_documento ?? user.tipoDocumento ?? user.doc_type,
    ),
    docNumber: String(
      user.dni ??
        user.numero_documento ??
        user.numeroDocumento ??
        user.doc_number ??
        '',
    ).trim(),
    names: split.names,
    paternalSurname: String(paternal || '').trim() || split.paternalSurname,
    maternalSurname: String(maternal || '').trim() || split.maternalSurname,
    email: String(user.email ?? user.correo ?? '').trim(),
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
}) {
  const metodoPago = PAYMENT_METHOD_TO_BACKEND[paymentMethod] || 'tarjeta'
  return {
    token_sesion: tokenSesion,
    id_viaje: idViaje,
    comprador: {
      tipo_documento: buyer.docType,
      numero_documento: String(buyer.docNumber || '').trim(),
      nombres: String(buyer.names || '').trim(),
      apellidos:
        `${String(buyer.paternalSurname || '').trim()} ${String(
          buyer.maternalSurname || '',
        ).trim()}`.trim(),
      email: buyer.email,
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
  }
}

function validateCheckoutForm({ buyer, passengers }) {
  const errors = []
  if (!buyer.docNumber?.trim()) errors.push('Número de documento del comprador')
  if (!buyer.names?.trim()) errors.push('Nombres del comprador')
  if (!buyer.paternalSurname?.trim()) errors.push('Apellido paterno del comprador')
  if (!buyer.email?.trim()) errors.push('Correo del comprador')

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
  showCreateAccountCheckbox = false,
  createAccountChecked = false,
  onToggleCreateAccount,
}) {
  const update = (field, value) => {
    onChange({ ...buyer, [field]: value })
  }
  const lockFromPax1 = buyerIsPax1
  const lockFromAuth = Boolean(buyerReadOnlyReason)
  const allLocked = lockFromPax1 || lockFromAuth

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-neutral-900">
          Datos del comprador
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

      <div className="grid sm:grid-cols-2 gap-4">
        <SelectField
          id="buyer-docType"
          label="Tipo de Documento"
          value={buyer.docType}
          onChange={(v) => update('docType', v)}
          options={DOC_TYPES}
          disabled={allLocked}
        />
        <InputField
          id="buyer-docNumber"
          label="Número de Documento"
          value={buyer.docNumber}
          onChange={(v) => update('docNumber', v)}
          placeholder="Ej. 74872562"
          disabled={allLocked}
        />
      </div>
      <InputField
        id="buyer-names"
        label="Nombres"
        value={buyer.names}
        onChange={(v) => update('names', v)}
        placeholder="Ej. Juan Carlos"
        disabled={allLocked}
      />
      <div className="grid sm:grid-cols-2 gap-4">
        <InputField
          id="buyer-paternal"
          label="Apellido Paterno"
          value={buyer.paternalSurname}
          onChange={(v) => update('paternalSurname', v)}
          placeholder="Ej. Pérez"
          disabled={allLocked}
        />
        <InputField
          id="buyer-maternal"
          label="Apellido Materno"
          value={buyer.maternalSurname}
          onChange={(v) => update('maternalSurname', v)}
          placeholder="Ej. Mendoza"
          disabled={allLocked}
        />
      </div>
      <InputField
        id="buyer-email"
        label="Correo Electrónico"
        type="email"
        value={buyer.email}
        onChange={(v) => update('email', v)}
        placeholder="correo@ejemplo.com"
        disabled={lockFromPax1}
      />

      {showCreateAccountCheckbox && onToggleCreateAccount && (
        <div className="pt-1">
          <Checkbox
            id="guest-create-account"
            checked={createAccountChecked}
            onChange={onToggleCreateAccount}
            tone="subtle"
          >
            Guardar mis datos y crear una cuenta de Bustoke para futuros viajes
            (Opcional)
          </Checkbox>
        </div>
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
  const displaySeats = selectedSeats.map(formatSeat)
  const displayDate = date || DEFAULT_DATE
  return (
    <article className="bg-white rounded-2xl shadow-card p-6 flex flex-col gap-4">
      <h2 className="text-lg font-bold text-neutral-900">Resumen de Compra</h2>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-neutral-600">Ruta</p>
        <p className="text-base font-semibold text-neutral-900 leading-tight">
          {trip.origin} a {trip.destination}
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
          <dd className="font-medium text-neutral-900 text-right">{trip.company}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-neutral-600">Fecha</dt>
          <dd className="font-medium text-neutral-900 text-right">{displayDate}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-neutral-600">Hora</dt>
          <dd className="font-medium text-neutral-900 text-right">{trip.departureTime}</dd>
        </div>
      </dl>

      <div className="h-px bg-neutral-200" />

      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-600">Total</span>
        <span className="text-2xl font-bold text-neutral-900">
          S/ {total.toFixed(2)}
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
  showCreateAccountCheckbox = false,
  createAccountChecked = false,
  onToggleCreateAccount,
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
          showCreateAccountCheckbox={showCreateAccountCheckbox}
          createAccountChecked={createAccountChecked}
          onToggleCreateAccount={onToggleCreateAccount}
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

function PaymentPanel({
  paymentMethod,
  onSelectPayment,
  acceptedTerms,
  onToggleTerms,
  total,
  onPay,
  isProcessing = false,
  payError = null,
}) {
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

  if (selectedSeatsFull.length === 0) {
    const fallbackSeats = readCheckoutSeatsFromStorage()
    if (fallbackSeats.length > 0) {
      console.warn(
        '[Checkout] selectedSeatsFull no vino en location.state; ' +
          'recuperando respaldo desde sessionStorage.',
        { key: CHECKOUT_SEATS_STORAGE_KEY, count: fallbackSeats.length },
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
  console.log('[Checkout] seatIdMap', {
    size: seatIdMap.size,
    map: Array.from(seatIdMap.entries()),
    selectedSeatsFull,
  })

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
  const hasProfileData = useMemo(() => {
    if (!isAuthenticated) return false
    return Boolean(
      profileBuyer.docNumber ||
        profileBuyer.names ||
        profileBuyer.paternalSurname ||
        profileBuyer.email,
    )
  }, [isAuthenticated, profileBuyer])
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
  const [buyerIsPax1, setBuyerIsPax1] = useState(false)
  const [useProfileForPax1, setUseProfileForPax1] = useState(false)
  const [wantsCreateAccount, setWantsCreateAccount] = useState(false)
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

  const handleToggleBuyerIsPax1 = useCallback(
    (checked) => {
      setBuyerIsPax1(checked)
      if (checked && passengers[0]) {
        setBuyer((prev) => ({
          ...prev,
          docType: passengers[0].docType || prev.docType,
          docNumber: passengers[0].docNumber || '',
          names: passengers[0].names || '',
          paternalSurname: passengers[0].paternalSurname || '',
          maternalSurname: passengers[0].maternalSurname || '',
        }))
      }
    },
    [passengers],
  )

  const handleToggleUseProfileForPax1 = useCallback(
    (checked) => {
      setUseProfileForPax1(checked)
      if (checked && passengers[0]) {
        const p0 = passengers[0]
        setPassengers((prev) =>
          prev.map((p, i) =>
            i === 0
              ? {
                  ...p,
                  docType: profileBuyer.docType || p.docType,
                  docNumber: profileBuyer.docNumber || p.docNumber,
                  names: profileBuyer.names || p.names,
                  paternalSurname:
                    profileBuyer.paternalSurname || p.paternalSurname,
                  maternalSurname:
                    profileBuyer.maternalSurname || p.maternalSurname,
                }
              : p,
          ),
        )
        setExpandedPax((prev) => (prev.includes(0) ? prev : [...prev, 0]))
        console.log(
          '[Checkout] Datos de perfil copiados al Pasajero 1',
          { p0Doc: p0.docNumber, profile: profileBuyer },
        )
      }
    },
    [passengers, profileBuyer],
  )

  const buyerReadOnlyReason = isAuthenticated
    ? 'Estos datos vienen de tu perfil y se usarán para emitir el comprobante.'
    : null

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
      navigate(`/viaje/${idViaje}/asientos`)
    } else {
      navigate(-1)
    }
  }, [onBack, idViaje, navigate])

  const handleChangePassenger = (index, updated) => {
    setPassengers((prev) => prev.map((p, i) => (i === index ? updated : p)))
  }

  const handlePay = async () => {
    const collectedSnapshot = {
      passengers,
      buyer,
      paymentMethod,
      selectedSeats,
      selectedSeatsFull,
      isProcessing,
      acceptedTerms,
    }
    console.log('[Checkout] handlePay disparado', collectedSnapshot)

    const tokenSesion = readSessionToken()
    console.log('[Checkout] token_sesion recuperado de sessionStorage', {
      key: SEAT_SESSION_TOKEN_KEY,
      present: Boolean(tokenSesion),
      tokenSesion,
    })

    if (isProcessing) {
      console.warn('[Checkout] handlePay ignorado: ya hay un pago en proceso')
      return
    }

    if (!acceptedTerms) {
      console.error(
        '[Checkout] handlePay bloqueado: el usuario no aceptó los términos',
      )
      setPayError('Debes aceptar los términos y condiciones.')
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
      return
    }

    const validationErrors = validateCheckoutForm({ buyer, passengers })
    if (validationErrors.length > 0) {
      console.error(
        '[Checkout] Validación de formulario incompleta',
        { buyer, passengers, validationErrors },
      )
      setPayError(
        `Completa los campos obligatorios: ${validationErrors.join(', ')}.`,
      )
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
      setPayError(
        'No pudimos mapear los asientos con la reserva. Vuelve al mapa de asientos.',
      )
      return
    }

    const resolvedIdViaje =
      idViaje ?? (trip?.id ? Number(trip.id) : null)
    if (!resolvedIdViaje) {
      console.error('[Checkout] idViaje no resuelto', { idViaje, trip })
      setPayError('No se pudo identificar el viaje. Vuelve a los resultados.')
      return
    }

    const payload = buildBookingPayload({
      idViaje: resolvedIdViaje,
      tokenSesion,
      buyer,
      passengers,
      seatIdMap,
      paymentMethod,
    })

    console.log(
      '[Checkout] POST http://localhost:8000/v1/bookings/process',
      payload,
    )

    setIsProcessing(true)
    setPayError(null)
    try {
      const result = await processBookingRequest(payload)
      console.log(
        '[Checkout] Respuesta 201 de /v1/bookings/process',
        result,
      )

      clearSessionToken()
      clearCheckoutSeatsStorage()
      setPassengers([])
      setBuyer(getEmptyBuyer())
      setAcceptedTerms(false)
      setUseProfileForPax1(false)
      setWantsCreateAccount(false)
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
      setPayError(
        err?.message ||
          'No pudimos procesar el pago. Intenta nuevamente en unos minutos.',
      )
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
              showCreateAccountCheckbox={!isAuthenticated}
              createAccountChecked={wantsCreateAccount}
              onToggleCreateAccount={setWantsCreateAccount}
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
              showCreateAccountCheckbox={!isAuthenticated}
              createAccountChecked={wantsCreateAccount}
              onToggleCreateAccount={setWantsCreateAccount}
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
        </main>

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

        <BottomNav active="buscar" onNavigate={onNavigate} />
      </div>

      <ExpiredModal open={showExpiredModal} onAccept={handleAcceptExpired} />
    </div>
  )
}
