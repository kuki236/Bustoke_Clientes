import {
  ArrowLeft,
  Bus,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Navbar from './Navbar'
import Alert from './Alert'

const HERO_IMAGES = [
  'https://images.unsplash.com/photo-1526392060635-9d6019884377?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1587595431973-160d0d94c1d6?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1531968455001-5c5272a41129?auto=format&fit=crop&w=1600&q=80',
]

const CAROUSEL_QUOTES = [
  {
    title: 'Convierte tu próximo viaje en una experiencia rápida y sin estrés.',
    subtitle: 'Sin ir al terminal, sin hacer colas, sin perder tiempo...',
  },
  {
    title: 'Compra tus pasajes en menos de un minuto.',
    subtitle: 'Elige tu asiento, paga seguro y recibe tu boleto al instante.',
  },
  {
    title: 'Viaja por todo el Perú con las mejores agencias.',
    subtitle: 'Cruz del Sur, Oltursa, Civa, Soyuz y más en un solo lugar.',
  },
]

function AuthHeroPanel() {
  const [activeIndex, setActiveIndex] = useState(0)
  const total = HERO_IMAGES.length
  const quote = CAROUSEL_QUOTES[activeIndex]

  const goPrev = () => {
    setActiveIndex((prev) => (prev - 1 + total) % total)
  }
  const goNext = () => {
    setActiveIndex((prev) => (prev + 1) % total)
  }

  return (
    <aside
      className="relative hidden md:flex flex-col justify-end p-12 text-white bg-neutral-900 overflow-hidden"
      aria-hidden="true"
    >
      {HERO_IMAGES.map((src, i) => (
        <div
          key={src}
          className={`absolute inset-0 bg-cover bg-center transition-opacity duration-700 ${
            i === activeIndex ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ backgroundImage: `url(${src})` }}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/30" />

      <div className="relative z-10 max-w-md">
        <h2 className="text-3xl font-bold leading-tight mb-4">
          {quote.title}
        </h2>
        <p className="text-sm text-white/80 leading-relaxed">
          {quote.subtitle}
        </p>
      </div>

      <div className="relative z-10 mt-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {HERO_IMAGES.map((_, i) => (
            <button
              key={`dot-${i}`}
              type="button"
              onClick={() => setActiveIndex(i)}
              aria-label={`Ir a la imagen ${i + 1}`}
              className={`h-2 rounded-full transition-all ${
                i === activeIndex
                  ? 'w-6 bg-white'
                  : 'w-2 bg-white/40 hover:bg-white/60'
              }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            aria-label="Imagen anterior"
            className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-white" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Siguiente imagen"
            className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
    </aside>
  )
}

function MobileLogoHeader() {
  return (
    <header className="block md:hidden bg-white border-b border-neutral-100 px-5 py-4 flex items-center gap-2 text-blue-600">
      <Bus className="w-6 h-6" />
      <span className="text-lg font-bold tracking-tight">BUSTOKE</span>
    </header>
  )
}

function AuthToggleLink({ mode, onChangeMode }) {
  const text =
    mode === 'login'
      ? '¿No tienes una cuenta?'
      : '¿Ya tienes una cuenta?'
  const cta = mode === 'login' ? 'Regístrate aquí' : 'Inicia sesión'
  return (
    <p className="text-sm text-neutral-600 text-center">
      {text}{' '}
      <button
        type="button"
        onClick={() => onChangeMode(mode === 'login' ? 'registro' : 'login')}
        className="text-blue-600 font-semibold hover:underline"
      >
        {cta}
      </button>
    </p>
  )
}

function LoginForm({ onChangeMode, onBack, isDesktop = false }) {
  const { loginUser } = useAuth()
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!correo || !contrasena) {
      setError('Ingresa tu correo y contraseña para continuar.')
      return
    }
    setSubmitting(true)
    try {
      await loginUser(correo, contrasena)
      if (remember) {
        try {
          localStorage.setItem('bustoke_remember_email', correo)
        } catch {
          // ignore
        }
      }
    } catch (err) {
      const status = err?.status
      if (status === 401) {
        setError('Correo o contraseña incorrectos. Verifica e inténtalo de nuevo.')
      } else if (status === 403) {
        setError('Tu cuenta no tiene permisos para iniciar sesión.')
      } else if (status === 429) {
        setError('Demasiados intentos. Espera unos minutos antes de volver a intentarlo.')
      } else if (status >= 500) {
        setError('El servidor tuvo un problema. Intenta nuevamente en unos minutos.')
      } else {
        setError(err?.message || 'No se pudo iniciar sesión. Intenta nuevamente.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4 w-full"
    >
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="correo"
          className="text-xs font-semibold text-neutral-900 mb-1"
        >
          Correo
        </label>
        <input
          id="correo"
          name="correo"
          type="email"
          autoComplete="email"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          placeholder="Escribe tu correo"
          className="w-full px-3 py-2.5 border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder:text-neutral-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="contrasena"
          className="text-xs font-semibold text-neutral-900 mb-1"
        >
          Contraseña
        </label>
        <div className="relative">
          <input
            id="contrasena"
            name="contrasena"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            placeholder="Escribe tu contraseña"
            className="w-full px-3 pr-20 py-2.5 border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder:text-neutral-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={
              showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
            }
            className="absolute inset-y-0 right-2 my-1 px-2 inline-flex items-center justify-center text-blue-600 text-xs font-semibold rounded-md hover:bg-blue-50 transition-colors"
          >
            {showPassword ? (
              <span className="inline-flex items-center gap-1">
                <EyeOff className="w-4 h-4" />
                Ocultar
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Eye className="w-4 h-4" />
                Mostrar
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor="recordar"
          className="inline-flex items-center gap-2 text-sm text-neutral-700 cursor-pointer"
        >
          <input
            id="recordar"
            name="recordar"
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="w-4 h-4 rounded border-neutral-400 text-blue-600 accent-blue-600"
          />
          Recordar cuenta
        </label>
        <button
          type="button"
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <button
        type="submit"
        disabled={submitting}
        className={`w-full mt-2 py-3 rounded-xl font-medium shadow-md transition-colors ${
          submitting
            ? 'bg-blue-600/70 text-white cursor-wait'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {submitting ? 'Ingresando…' : 'Iniciar sesión'}
      </button>

      <AuthToggleLink mode="login" onChangeMode={onChangeMode} />

      {!isDesktop && onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mt-2 inline-flex items-center justify-center gap-1 text-sm text-neutral-600 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al inicio
        </button>
      )}
    </form>
  )
}

function LoginPageContent({ onChangeMode, onBack }) {
  return (
    <div className="min-h-screen bg-white md:grid md:grid-cols-2">
      <AuthHeroPanel />

      <section className="flex flex-col">
        <div className="hidden md:block">
          <Navbar
            onNavigate={() => {}}
            active="login"
            hideNavItems
            authSlot="login"
            onLoginClick={onBack}
          />
        </div>
        <div className="hidden md:flex flex-1 flex-col justify-center items-center p-12">
          <div className="w-full max-w-lg flex flex-col gap-6">
            <header className="flex flex-col gap-2">
              <h1 className="text-4xl font-medium text-neutral-900">
                Iniciar sesión
              </h1>
              <p className="text-sm text-neutral-600">
                Bienvenida de nuevo, por favor ingrese sus datos.
              </p>
            </header>
            <LoginForm
              onChangeMode={onChangeMode}
              onBack={onBack}
              isDesktop
            />
          </div>
        </div>

        <div className="block md:hidden pb-24">
          <MobileLogoHeader />
          <div className="p-6 mt-8 flex flex-col gap-4">
            <header className="flex flex-col gap-2">
              <h1 className="text-3xl font-semibold text-neutral-900">
                Iniciar sesión
              </h1>
              <p className="text-sm text-neutral-600">
                Bienvenida de nuevo, por favor ingrese sus datos.
              </p>
            </header>
            <LoginForm onChangeMode={onChangeMode} onBack={onBack} />
          </div>
        </div>
      </section>
    </div>
  )
}

export default function LoginPage({ onChangeMode, onBack }) {
  return <LoginPageContent onChangeMode={onChangeMode} onBack={onBack} />
}
