import {
  ArrowLeft,
  Bus,
  Eye,
  EyeOff,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Navbar from './Navbar'
import Alert from './Alert'

const HERO_IMAGES = [
  'https://images.unsplash.com/photo-1526392060635-9d6019884377?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1620417396507-9a57523d16a6?auto=format&fit=crop&w=1600&q=80',
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

const CAROUSEL_INTERVAL_MS = 5000

function AuthHeroPanel() {
  const [activeIndex, setActiveIndex] = useState(0)
  const total = HERO_IMAGES.length
  const quote = CAROUSEL_QUOTES[activeIndex]
  const intervalRef = useRef(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % total)
    }, CAROUSEL_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [total])

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

      <div className="relative z-10 mt-8 flex items-center justify-start">
        <div className="flex items-center gap-2 opacity-70">
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
      </div>
    </aside>
  )
}

function MobileLogoHeader() {
  return (
    <header className="block md:hidden bg-white border-b border-neutral-100 pt-8 pl-8 pr-8 pb-4 flex items-center gap-2 text-blue-600">
      <Bus className="w-6 h-6" />
      <span className="text-lg font-bold tracking-tight">BUSTOKE</span>
    </header>
  )
}

function AuthToggleLink({ onChangeMode }) {
  return (
    <p className="text-sm text-neutral-600 text-center">
      ¿Ya tienes una cuenta?{' '}
      <button
        type="button"
        onClick={() => onChangeMode('login')}
        className="text-blue-600 font-semibold hover:underline"
      >
        Inicia sesión
      </button>
    </p>
  )
}

function FormField({ id, name, label, type = 'text', placeholder, value, onChange, autoComplete, inputMode, pattern, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-semibold text-neutral-900 mb-0.5">
        {label}
      </label>
      {children ? (
        <div className="relative">
          <input
            id={id}
            name={name}
            type={type}
            autoComplete={autoComplete}
            inputMode={inputMode}
            pattern={pattern}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            className="w-full px-3 py-2.5 border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder:text-neutral-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {children}
        </div>
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          autoComplete={autoComplete}
          inputMode={inputMode}
          pattern={pattern}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder:text-neutral-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      )}
    </div>
  )
}

const TIPOS_DOCUMENTO_OPTIONS = [
  { value: 'DNI', label: 'DNI', pattern: '[0-9]{8}', inputMode: 'numeric', maxLength: 8 },
  { value: 'C.E.', label: 'C.E.', pattern: '[0-9]{9}', inputMode: 'numeric', maxLength: 9 },
  { value: 'Pasaporte', label: 'Pasaporte', pattern: undefined, inputMode: 'text', maxLength: 20 },
]

function DocumentoField({ tipoDocumento, numeroDocumento, onTipoChange, onNumeroChange }) {
  const selected = TIPOS_DOCUMENTO_OPTIONS.find((opt) => opt.value === tipoDocumento) || TIPOS_DOCUMENTO_OPTIONS[0]

  return (
    <div className="flex flex-col gap-1 w-full">
      <label
        htmlFor="numero_documento"
        className="text-xs font-semibold text-neutral-900 mb-0.5"
      >
        Documento de Identidad
      </label>
      <div className="flex items-center w-full gap-2 mt-1">
        <select
          aria-label="Tipo de documento"
          value={tipoDocumento}
          onChange={(e) => onTipoChange(e.target.value)}
          className="w-[28%] shrink-0 border border-neutral-300 rounded-xl bg-neutral-50 px-2 py-2.5 text-sm text-neutral-900 font-medium outline-none cursor-pointer focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {TIPOS_DOCUMENTO_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          id="numero_documento"
          name="numero_documento"
          type="text"
          autoComplete="off"
          inputMode={selected.inputMode}
          pattern={selected.pattern}
          maxLength={selected.maxLength}
          value={numeroDocumento}
          onChange={(e) => onNumeroChange(e.target.value)}
          placeholder="Ej. 45678912"
          className="flex-1 min-w-0 border border-neutral-300 rounded-xl bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
    </div>
  )
}

function RegisterForm({ onChangeMode, onBack, isDesktop = false }) {
  const { registerUser, isAuthenticated } = useAuth()
  const [form, setForm] = useState({
    nombres: '',
    apellido_paterno: '',
    apellido_materno: '',
    tipo_documento: 'DNI',
    numero_documento: '',
    correo: '',
    contrasena: '',
    telefono: '',
    fecha_nacimiento: '',
  })
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const update = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const required = [
      ['nombres', 'Nombres'],
      ['apellido_paterno', 'Apellido Paterno'],
      ['apellido_materno', 'Apellido Materno'],
      ['tipo_documento', 'Tipo de documento'],
      ['numero_documento', 'Número de documento'],
      ['correo', 'Correo electrónico'],
      ['contrasena', 'Contraseña'],
    ]
    const missing = required
      .filter(([field]) => !form[field]?.trim())
      .map(([, label]) => label)
    if (missing.length > 0) {
      setError(`Completa los campos: ${missing.join(', ')}.`)
      return
    }
    if (form.contrasena.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (!acceptTerms) {
      setError('Debes aceptar los términos y condiciones.')
      return
    }
    setSubmitting(true)
    try {
      await registerUser({
        nombres: form.nombres.trim(),
        apellido_paterno: form.apellido_paterno.trim(),
        apellido_materno: form.apellido_materno.trim(),
        tipo_documento: form.tipo_documento,
        numero_documento: form.numero_documento.trim(),
        telefono: form.telefono.trim(),
        email: form.correo.trim(),
        contrasena: form.contrasena,
        fecha_nacimiento: form.fecha_nacimiento || null,
      })
    } catch (err) {
      const status = err?.status
      if (status === 409) {
        setError('El correo ya está registrado. Intenta iniciar sesión.')
      } else if (status === 400) {
        setError(err?.message || 'Revisa los datos ingresados. Algún campo no es válido.')
      } else if (status === 422) {
        setError(
          err?.message ||
            'Algunos campos no cumplen con el formato esperado (correo válido y contraseña de mínimo 8 caracteres).',
        )
      } else if (status >= 500) {
        setError('El servidor tuvo un problema. Intenta nuevamente en unos minutos.')
      } else {
        setError(err?.message || 'No se pudo crear la cuenta. Intenta nuevamente.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (isAuthenticated) {
    return (
      <div className="flex flex-col items-center gap-4 text-center py-8">
        <Alert variant="success" className="w-full">
          <p className="font-medium">¡Cuenta creada con éxito!</p>
          <p className="text-xs mt-1">Ya puedes buscar tus pasajes.</p>
        </Alert>
        <button
          type="button"
          onClick={onBack}
          className="bg-blue-600 text-white font-medium rounded-xl px-6 py-3 hover:bg-blue-700 transition-colors"
        >
          Empezar a buscar
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col space-y-3 w-full"
    >
      <FormField
        id="nombres"
        name="nombres"
        label="Nombres"
        placeholder="Ej. Juan Carlos"
        autoComplete="given-name"
        value={form.nombres}
        onChange={update('nombres')}
      />
      <div className="grid grid-cols-2 gap-3">
        <FormField
          id="apellido_paterno"
          name="apellido_paterno"
          label="Apellido Paterno"
          placeholder="Ej. Pérez"
          autoComplete="family-name"
          value={form.apellido_paterno}
          onChange={update('apellido_paterno')}
        />
        <FormField
          id="apellido_materno"
          name="apellido_materno"
          label="Apellido Materno"
          placeholder="Ej. Mendoza"
          autoComplete="family-name"
          value={form.apellido_materno}
          onChange={update('apellido_materno')}
        />
      </div>
      <DocumentoField
        tipoDocumento={form.tipo_documento}
        numeroDocumento={form.numero_documento}
        onTipoChange={(value) => setForm((prev) => ({ ...prev, tipo_documento: value, numero_documento: '' }))}
        onNumeroChange={(value) => setForm((prev) => ({ ...prev, numero_documento: value }))}
      />
      <FormField
        id="telefono"
        name="telefono"
        type="tel"
        label="Teléfono (opcional)"
        placeholder="Ej. 987654321"
        autoComplete="tel"
        inputMode="numeric"
        pattern="[0-9]{9}"
        value={form.telefono}
        onChange={update('telefono')}
      />
      <FormField
        id="fecha_nacimiento"
        name="fecha_nacimiento"
        type="date"
        label="Fecha de Nacimiento (opcional)"
        autoComplete="bday"
        value={form.fecha_nacimiento}
        onChange={update('fecha_nacimiento')}
      />
      <FormField
        id="correo"
        name="correo"
        type="email"
        label="Correo electrónico"
        placeholder="ejemplo@correo.com"
        autoComplete="email"
        value={form.correo}
        onChange={update('correo')}
      />
      <FormField
        id="contrasena"
        name="contrasena"
        type={showPassword ? 'text' : 'password'}
        label="Contraseña"
        placeholder="••••••••"
        autoComplete="new-password"
        value={form.contrasena}
        onChange={update('contrasena')}
      >
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          aria-label={
            showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
          }
          className="absolute inset-y-0 right-2 my-1 p-2 inline-flex items-center justify-center text-blue-600 text-xs font-semibold rounded-md hover:bg-blue-50 transition-colors"
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
      </FormField>

      <label
        htmlFor="terminos"
        className="flex items-start gap-2 text-xs leading-tight text-neutral-700 cursor-pointer"
      >
        <input
          id="terminos"
          name="terminos"
          type="checkbox"
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-neutral-400 text-blue-600 accent-blue-600"
        />
        <span>
          Acepto los{' '}
          <a
            href="#terminos"
            onClick={(e) => e.preventDefault()}
            className="text-blue-600 hover:text-blue-700 hover:underline cursor-pointer transition-colors font-medium"
          >
            Términos y Condiciones
          </a>{' '}
          y la{' '}
          <a
            href="#privacidad"
            onClick={(e) => e.preventDefault()}
            className="text-blue-600 hover:text-blue-700 hover:underline cursor-pointer transition-colors font-medium"
          >
            Política de Privacidad
          </a>
          .
        </span>
      </label>

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
        {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
      </button>

      <AuthToggleLink onChangeMode={onChangeMode} />

      {!isDesktop && onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mt-6 text-sm font-medium flex items-center justify-center gap-2 text-neutral-500 hover:text-neutral-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al inicio
        </button>
      )}
    </form>
  )
}

export default function RegisterPage({ onChangeMode, onBack }) {
  return (
    <div className="min-h-screen bg-white md:grid md:grid-cols-2">
      <AuthHeroPanel />

      <section className="flex flex-col">
        <div className="hidden md:block">
          <Navbar
            onNavigate={() => {}}
            active="registro"
            hideNavItems
            authSlot="registro"
            onLoginClick={onBack}
          />
        </div>
        <div className="hidden md:flex flex-1 flex-col justify-center items-center p-12">
          <div className="w-full max-w-lg flex flex-col gap-6">
            <header className="flex flex-col gap-2">
              <h1 className="text-4xl font-medium text-neutral-900">
                Crear cuenta
              </h1>
              <p className="text-sm text-neutral-600">
                Regístrate para comprar pasajes y gestionar tus viajes.
              </p>
            </header>
            <RegisterForm
              onChangeMode={onChangeMode}
              onBack={onBack}
              isDesktop
            />
          </div>
        </div>

        <div className="block md:hidden">
          <MobileLogoHeader />
          <div className="min-h-[calc(100vh-70px)] flex flex-col justify-center px-6 pb-12">
            <header className="flex flex-col gap-2 mb-4">
              <h1 className="text-3xl font-semibold text-neutral-900">
                Crear cuenta
              </h1>
              <p className="text-sm text-neutral-600">
                Regístrate para comprar pasajes y gestionar tus viajes.
              </p>
            </header>
            <RegisterForm onChangeMode={onChangeMode} onBack={onBack} />
          </div>
        </div>
      </section>
    </div>
  )
}
