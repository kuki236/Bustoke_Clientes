import { useRef, useState } from 'react'
import {
  BookText,
  CircleUserRound,
  Hash,
  IdCard,
  LogOut,
  Mail,
  UserRound,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AvatarMenu from './AvatarMenu'
import BottomNav from './BottomNav'
import Navbar from './Navbar'

const FALLBACK_PROFILE = {
  id_usuario: null,
  nombres: 'Sebastian',
  apellido_paterno: 'Tejeda',
  apellido_materno: 'Ramirez',
  tipo_documento: 'DNI',
  numero_documento: '72819463',
  email: 'sebastian.tejeda@bustoke.pe',
  telefono: '987654321',
  accountType: 'Pasajero B2C',
}

const EMPTY_FORM = {
  id_usuario: '',
  nombres: '',
  apellido_paterno: '',
  apellido_materno: '',
  dni: '',
  email: '',
  telefono: '',
}

function pickFirst(user, ...keys) {
  if (!user) return ''
  for (const key of keys) {
    const value = user[key]
    if (value !== undefined && value !== null && value !== '') {
      return value
    }
  }
  return ''
}

function buildFormFromUser(user) {
  if (!user) return { ...EMPTY_FORM }
  return {
    id_usuario: String(
      pickFirst(user, 'id_usuario', 'idUsuario', 'id') ?? '',
    ),
    nombres: String(
      pickFirst(user, 'nombres', 'names', 'name', 'nombre') ?? '',
    ).trim(),
    apellido_paterno: String(
      pickFirst(
        user,
        'apellido_paterno',
        'apellidoPaterno',
        'paternal_surname',
        'paternalSurname',
      ) ?? '',
    ).trim(),
    apellido_materno: String(
      pickFirst(
        user,
        'apellido_materno',
        'apellidoMaterno',
        'maternal_surname',
        'maternalSurname',
      ) ?? '',
    ).trim(),
    dni: String(
      pickFirst(user, 'dni', 'numero_documento', 'numeroDocumento', 'doc_number') ?? '',
    ).trim(),
    email: String(pickFirst(user, 'email', 'correo') ?? '').trim(),
    telefono: String(
      pickFirst(user, 'telefono', 'phone', 'telephone') ?? '',
    ).trim(),
  }
}

function ProfileAvatar({ size = 'lg', className = '' }) {
  const sizeClasses =
    size === 'xl'
      ? 'w-24 h-24 md:w-28 md:h-28'
      : 'w-20 h-20'

  return (
    <div
      className={`${sizeClasses} rounded-full bg-blue-50 text-blue-600 flex items-center justify-center border-4 border-white shadow-md ${className}`}
      aria-hidden="true"
    >
      <CircleUserRound
        className={size === 'xl' ? 'w-16 h-16 md:w-20 md:h-20' : 'w-12 h-12'}
        strokeWidth={1.5}
      />
    </div>
  )
}

function FormField({
  id,
  icon: Icon,
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
  autoComplete,
  inputMode,
  readOnly = false,
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div
        className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5"
        aria-hidden="true"
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex flex-col min-w-0 flex-1 gap-1">
        <label
          htmlFor={id}
          className="text-[11px] uppercase tracking-wide text-neutral-500"
        >
          {label}
        </label>
        <input
          id={id}
          name={id}
          type={type}
          value={value ?? ''}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          readOnly={readOnly}
          className={`w-full px-3 py-2 border rounded-lg text-sm text-neutral-900 placeholder:text-neutral-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            readOnly
              ? 'bg-neutral-100 text-neutral-500 border-neutral-200 cursor-not-allowed'
              : 'border-neutral-300'
          }`}
        />
      </div>
    </div>
  )
}

function ProfileForm({ values, onChange, readOnly = false }) {
  const update = (field) => (next) => {
    onChange({ ...values, [field]: next })
  }
  return (
    <div className="flex flex-col divide-y divide-neutral-100">
      <FormField
        id="profile-nombres"
        icon={UserRound}
        label="Nombres"
        value={values.nombres}
        onChange={update('nombres')}
        placeholder="Tus nombres"
        autoComplete="given-name"
        readOnly={readOnly}
      />
      <FormField
        id="profile-apellido-paterno"
        icon={UserRound}
        label="Apellido Paterno"
        value={values.apellido_paterno}
        onChange={update('apellido_paterno')}
        placeholder="Apellido paterno"
        autoComplete="family-name"
        readOnly={readOnly}
      />
      <FormField
        id="profile-apellido-materno"
        icon={UserRound}
        label="Apellido Materno"
        value={values.apellido_materno}
        onChange={update('apellido_materno')}
        placeholder="Apellido materno (opcional)"
        autoComplete="additional-name"
        readOnly={readOnly}
      />
      <FormField
        id="profile-dni"
        icon={IdCard}
        label="DNI / Documento"
        value={values.dni}
        onChange={update('dni')}
        placeholder="Ej. 72819463"
        autoComplete="off"
        inputMode="numeric"
        readOnly={readOnly}
      />
      <FormField
        id="profile-email"
        icon={Mail}
        label="Correo electrónico"
        type="email"
        value={values.email}
        onChange={update('email')}
        placeholder="correo@ejemplo.com"
        autoComplete="email"
        inputMode="email"
        readOnly={readOnly}
      />
      <FormField
        id="profile-telefono"
        icon={Hash}
        label="Teléfono"
        type="tel"
        value={values.telefono}
        onChange={update('telefono')}
        placeholder="987654321"
        autoComplete="tel"
        inputMode="tel"
        readOnly={readOnly}
      />
    </div>
  )
}

function ProfileSidebar({ profile }) {
  const fullName = [
    profile.nombres,
    profile.apellido_paterno,
    profile.apellido_materno,
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
  return (
    <aside className="bg-white rounded-2xl shadow-card p-6 flex flex-col items-center gap-4 text-center h-fit">
      <ProfileAvatar size="xl" />
      <div className="flex flex-col gap-1">
        <p className="text-lg font-bold text-neutral-900">
          {fullName || profile.email || 'Cuenta BUSTOKE'}
        </p>
        <span className="inline-flex items-center justify-center bg-blue-50 text-blue-600 border border-blue-100 rounded-full px-3 py-0.5 text-xs font-medium">
          {profile.accountType}
        </span>
      </div>
      <p className="text-xs text-neutral-500 mt-1">
        Gestiona tu información personal y mantén tus datos actualizados.
      </p>
    </aside>
  )
}

function ClaimsLink({ onOpen, className = '' }) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.('reclamos')}
      className={`w-full flex items-center gap-3 p-4 bg-white rounded-2xl shadow-card border border-neutral-100 hover:border-blue-200 transition-colors text-left ${className}`}
    >
      <span
        className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"
        aria-hidden="true"
      >
        <BookText className="w-5 h-5" />
      </span>
      <span className="flex-1 flex flex-col min-w-0">
        <span className="text-sm font-semibold text-neutral-900">
          Libro de Reclamaciones
        </span>
        <span className="text-xs text-neutral-500 mt-0.5">
          Registra una queja o reclamo formal conforme al Código de
          Protección al Consumidor.
        </span>
      </span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4 text-neutral-400 shrink-0"
        aria-hidden="true"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  )
}

export default function ProfilePage({ onNavigate, onBack }) {
  const { user, isAuthenticated, logout } = useAuth()

  const initialProfile = isAuthenticated && user ? user : FALLBACK_PROFILE
  const userKey = isAuthenticated
    ? user?.id_usuario ?? user?.id ?? user?.email ?? 'auth'
    : 'guest'
  const [form, setForm] = useState(() => buildFormFromUser(initialProfile))
  const lastSyncedKeyRef = useRef(userKey)
  if (lastSyncedKeyRef.current !== userKey) {
    lastSyncedKeyRef.current = userKey
    setForm(buildFormFromUser(initialProfile))
  }

  const displayProfile = {
    ...initialProfile,
    nombres: form.nombres || initialProfile.nombres || '',
    apellido_paterno:
      form.apellido_paterno || initialProfile.apellido_paterno || '',
    apellido_materno:
      form.apellido_materno || initialProfile.apellido_materno || '',
    dni: form.dni || initialProfile.dni || initialProfile.numero_documento || '',
    email: form.email || initialProfile.email || '',
    telefono: form.telefono || initialProfile.telefono || '',
  }

  const handleLogout = () => {
    logout()
    onBack?.()
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="hidden md:block">
        <Navbar onNavigate={onNavigate} active="perfil" />
        <div className="max-w-7xl mx-auto p-8">
          <header className="mb-6">
            <h1 className="text-3xl font-bold text-neutral-900">Mi Perfil</h1>
            <p className="text-sm text-neutral-600 mt-2">
              Revisa y actualiza la información de tu cuenta BUSTOKE.
            </p>
          </header>

          <div className="grid md:grid-cols-[300px_1fr] gap-6">
            <div className="flex flex-col">
              <ProfileSidebar profile={displayProfile} />
              <ClaimsLink onOpen={onNavigate} className="mt-4" />
            </div>

            <section className="bg-white rounded-2xl shadow-card p-6 flex flex-col gap-4">
              <h2 className="text-lg font-bold text-neutral-900">
                Información de la cuenta
              </h2>
              <ProfileForm
                values={form}
                onChange={setForm}
                readOnly={!isAuthenticated}
              />
              <div className="pt-4 border-t border-neutral-100 flex justify-end">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 text-red-600 font-medium text-sm hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Cerrar Sesión
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>

      <div className="block md:hidden pb-24">
        <header className="bg-blue-600 p-6 text-white text-center rounded-b-3xl flex flex-col items-center gap-3 relative">
          {isAuthenticated && (
            <div className="absolute top-3 right-3">
              <AvatarMenu
                user={user}
                onNavigate={onNavigate}
                variant="light"
              />
            </div>
          )}
          <ProfileAvatar size="xl" />
          <p className="text-xl font-bold leading-tight">
            {[displayProfile.nombres, displayProfile.apellido_paterno]
              .filter(Boolean)
              .join(' ') ||
              displayProfile.email ||
              'Cuenta BUSTOKE'}
          </p>
          <span className="inline-flex items-center justify-center bg-white/15 text-white border border-white/30 rounded-full px-3 py-0.5 text-xs font-medium">
            {displayProfile.accountType}
          </span>
        </header>

        <main className="flex flex-col gap-4 p-4">
          <article className="bg-white rounded-2xl shadow-card p-5 flex flex-col">
            <h2 className="text-sm font-bold text-neutral-900 mb-2">
              Información personal
            </h2>
            <ProfileForm
              values={form}
              onChange={setForm}
              readOnly={!isAuthenticated}
            />
          </article>

          <ClaimsLink onOpen={onNavigate} />

          <button
            type="button"
            onClick={handleLogout}
            className="w-full bg-white border border-red-200 text-red-600 font-medium text-sm rounded-2xl shadow-card py-3 inline-flex items-center justify-center gap-2 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar Sesión
          </button>
        </main>

        <BottomNav active="perfil" onNavigate={onNavigate} />
      </div>
    </div>
  )
}
