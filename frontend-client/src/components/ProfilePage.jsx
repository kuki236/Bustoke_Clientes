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
import BottomNav from './BottomNav'
import Navbar from './Navbar'

const FALLBACK_PROFILE = {
  names: 'Sebastian',
  paternalSurname: 'Tejeda',
  maternalSurname: 'Ramirez',
  docType: 'DNI',
  docNumber: '72819463',
  email: 'sebastian.tejeda@bustoke.pe',
  accountType: 'Pasajero B2C',
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

function FieldRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div
        className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"
        aria-hidden="true"
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">
          {label}
        </span>
        <span className="text-sm font-semibold text-neutral-900 mt-0.5 break-words">
          {value}
        </span>
      </div>
    </div>
  )
}

function ProfileFields({ profile, className = '' }) {
  return (
    <div className={`flex flex-col divide-y divide-neutral-100 ${className}`}>
      <FieldRow icon={UserRound} label="Nombres" value={profile.names} />
      <FieldRow
        icon={UserRound}
        label="Apellido Paterno"
        value={profile.paternalSurname}
      />
      <FieldRow
        icon={UserRound}
        label="Apellido Materno"
        value={profile.maternalSurname}
      />
      <FieldRow
        icon={IdCard}
        label="Tipo de documento"
        value={profile.docType}
      />
      <FieldRow
        icon={Hash}
        label="Número de documento"
        value={profile.docNumber || '—'}
      />
      <FieldRow
        icon={Mail}
        label="Correo electrónico"
        value={profile.email}
      />
    </div>
  )
}

function ProfileSidebar({ profile }) {
  return (
    <aside className="bg-white rounded-2xl shadow-card p-6 flex flex-col items-center gap-4 text-center h-fit">
      <ProfileAvatar size="xl" />
      <div className="flex flex-col gap-1">
        <p className="text-lg font-bold text-neutral-900">
          {profile.names} {profile.paternalSurname} {profile.maternalSurname}
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
  const profile = isAuthenticated && user ? user : FALLBACK_PROFILE

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
              Revisa la información de tu cuenta BUSTOKE.
            </p>
          </header>

          <div className="grid md:grid-cols-[300px_1fr] gap-6">
            <div className="flex flex-col">
              <ProfileSidebar profile={profile} />
              <ClaimsLink onOpen={onNavigate} className="mt-4" />
            </div>

            <section className="bg-white rounded-2xl shadow-card p-6 flex flex-col gap-4">
              <h2 className="text-lg font-bold text-neutral-900">
                Información de la cuenta
              </h2>
              <ProfileFields profile={profile} />
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
        <header className="bg-blue-600 p-6 text-white text-center rounded-b-3xl flex flex-col items-center gap-3">
          <ProfileAvatar size="xl" />
          <p className="text-xl font-bold leading-tight">
            {profile.names} {profile.paternalSurname}
          </p>
          <span className="inline-flex items-center justify-center bg-white/15 text-white border border-white/30 rounded-full px-3 py-0.5 text-xs font-medium">
            {profile.accountType}
          </span>
        </header>

        <main className="flex flex-col gap-4 p-4">
          <article className="bg-white rounded-2xl shadow-card p-5 flex flex-col">
            <h2 className="text-sm font-bold text-neutral-900 mb-2">
              Información personal
            </h2>
            <ProfileFields profile={profile} />
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
