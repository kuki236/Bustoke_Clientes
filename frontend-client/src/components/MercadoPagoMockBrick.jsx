import { useEffect, useMemo, useRef, useState } from 'react'
import { CreditCard, Lock, HelpCircle, ChevronDown, Mail } from 'lucide-react'

const DOC_TYPES = [
  { value: 'DNI', label: 'DNI' },
  { value: 'CE', label: 'C.E.' },
  { value: 'Pasaporte', label: 'Pasaporte' },
  { value: 'RUC', label: 'RUC' },
]

const MAGIC_WORDS = [
  { code: 'APRO', status: 'approved', message: 'Pago aprobado por Mercado Pago.' },
  { code: 'OTHE', status: 'rejected', message: 'Pago rechazado por error general.' },
  { code: 'CONT', status: 'pending', message: 'Pago pendiente de procesamiento.' },
  { code: 'CALL', status: 'rejected', message: 'Pago rechazado, debe llamar para autorizar.' },
  { code: 'FUND', status: 'rejected', message: 'Fondos insuficientes.' },
  { code: 'SECU', status: 'rejected', message: 'Código de seguridad inválido.' },
  { code: 'EXPI', status: 'rejected', message: 'Fecha de vencimiento inválida.' },
  { code: 'FORM', status: 'rejected', message: 'Error en el formulario de pago.' },
]

const MP_BLUE = '#3483FA'
const MP_BLUE_HOVER = '#2070E0'

function detectBrand(number) {
  const n = String(number || '').replace(/\D/g, '')
  if (/^4/.test(n)) return 'visa'
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'master'
  if (/^3[47]/.test(n)) return 'amex'
  if (/^(36|30[0-5]|38|39)/.test(n)) return 'diners'
  return null
}

function formatCardNumber(value, brand) {
  const maxLen = brand === 'amex' ? 15 : 19
  const digits = String(value || '').replace(/\D/g, '').slice(0, maxLen)
  if (brand === 'amex') {
    const a = digits.slice(0, 4)
    const b = digits.slice(4, 10)
    const c = digits.slice(10, 15)
    return [a, b, c].filter(Boolean).join(' ')
  }
  return digits.replace(/(.{4})/g, '$1 ').trim()
}

function formatExpiry(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

function luhnValid(number) {
  const digits = String(number || '').replace(/\D/g, '')
  if (digits.length < 13) return false
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i])
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

function BrandLogo({ brand }) {
  if (brand === 'visa') {
    return (
      <span className="text-[11px] font-extrabold italic tracking-wide text-[#1A1F71] leading-none">
        VISA
      </span>
    )
  }
  if (brand === 'master') {
    return (
      <span className="inline-flex items-center leading-none">
        <span className="w-5 h-5 rounded-full bg-[#EB001B] inline-block" />
        <span className="w-5 h-5 rounded-full bg-[#F79E1B] -ml-2 inline-block mix-blend-multiply" />
      </span>
    )
  }
  if (brand === 'amex') {
    return (
      <span className="text-[9px] font-extrabold tracking-wide text-[#2E77BC] leading-none">
        AMEX
      </span>
    )
  }
  if (brand === 'diners') {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#0079BE] text-white text-[7px] font-extrabold leading-none">
        DC
      </span>
    )
  }
  return null
}

function BrandLogosRow() {
  return (
    <div className="flex items-center gap-2 opacity-90">
      <BrandLogo brand="visa" />
      <BrandLogo brand="master" />
      <BrandLogo brand="amex" />
      <BrandLogo brand="diners" />
    </div>
  )
}

const inputClass = `w-full px-3 py-2.5 border border-neutral-300 rounded-md text-sm text-neutral-900 placeholder:text-neutral-400 bg-white focus:outline-none focus:ring-2 focus:ring-[${MP_BLUE}] focus:border-[${MP_BLUE}] transition-colors disabled:bg-neutral-50 disabled:text-neutral-500`

const labelClass = 'text-xs font-semibold text-neutral-700 mb-1.5 block'

function FieldError({ children }) {
  if (!children) return null
  return (
    <p className="text-xs text-red-600 mt-1" role="alert">
      {children}
    </p>
  )
}

export default function MercadoPagoMockBrick({
  amount,
  payerEmail,
  onEmailChange,
  cardholderName: initialCardholderName,
  externalReference,
  onSubmit,
  onSuccess,
  onError,
  onReady,
}) {
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [name, setName] = useState(initialCardholderName || '')
  const [email, setEmail] = useState(payerEmail || '')
  const [docType, setDocType] = useState('DNI')
  const [docNumber, setDocNumber] = useState('')
  const [touched, setTouched] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (payerEmail && payerEmail !== email) {
      setEmail(payerEmail)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payerEmail])

  const handleEmailChange = (value) => {
    setEmail(value)
    onEmailChange?.(value)
  }

  const onReadyRef = useRef(onReady)
  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])
  useEffect(() => {
    onReadyRef.current?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const brand = useMemo(() => detectBrand(cardNumber), [cardNumber])
  const digitsOnly = cardNumber.replace(/\D/g, '')

  const errors = useMemo(() => {
    const e = {}
    if (!digitsOnly) e.cardNumber = 'Completa este campo'
    else if (digitsOnly.length < 13) e.cardNumber = 'Número incompleto'
    else if (!luhnValid(digitsOnly)) e.cardNumber = 'Número de tarjeta inválido'

    if (!expiry) e.expiry = 'Completa este campo'
    else {
      const m = expiry.match(/^(\d{2})\/(\d{2})$/)
      if (!m) e.expiry = 'Fecha inválida'
      else {
        const month = Number(m[1])
        const year = 2000 + Number(m[2])
        if (month < 1 || month > 12) e.expiry = 'Mes inválido'
        else {
          const expDate = new Date(year, month, 0)
          const now = new Date()
          if (expDate < new Date(now.getFullYear(), now.getMonth(), 1)) {
            e.expiry = 'Tarjeta vencida'
          }
        }
      }
    }

    if (!cvv) e.cvv = 'Completa este campo'
    else if (!/^\d{3,4}$/.test(cvv)) e.cvv = 'CVV inválido'

    if (!name.trim()) e.name = 'Completa este campo'

    if (!email.trim()) e.email = 'Completa este campo'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Email inválido'

    if (!docNumber.trim()) e.docNumber = 'Completa este campo'
    return e
  }, [digitsOnly, expiry, cvv, name, email, docNumber])

  const isFormValid = Object.keys(errors).length === 0

  const markAllTouched = () =>
    setTouched({
      cardNumber: true,
      expiry: true,
      cvv: true,
      name: true,
      email: true,
      docNumber: true,
    })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    markAllTouched()
    if (!isFormValid) return

    setSubmitting(true)
    await new Promise((r) => setTimeout(r, 1500))

    const nameUpper = name.toUpperCase()
    const matchedMagic = MAGIC_WORDS.find((m) => nameUpper.includes(m.code))

    if (matchedMagic && matchedMagic.status !== 'approved') {
      setError(matchedMagic.message)
      setSubmitting(false)
      onError?.({
        cause: matchedMagic.code.toLowerCase(),
        message: matchedMagic.message,
        status: matchedMagic.status,
      })
      return
    }

    if (matchedMagic && matchedMagic.status === 'approved') {
      onSuccess?.({ status: 'approved', id: 'mock-123456' })
    }

    const fakeToken = `MOCK-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 12)}`
    const fakePaymentId = Math.floor(Date.now() / 1000) % 1_000_000_000

    const cardFormData = {
      token: fakeToken,
      paymentMethodId:
        brand === 'master'
          ? 'master'
          : brand === 'amex'
            ? 'amex'
            : brand === 'diners'
              ? 'diners'
              : 'visa',
      issuerId: undefined,
      installments: 1,
      transactionAmount: Number(amount) || 0,
      externalReference: externalReference || 'BOOKING:NA:NA:1',
      payer: {
        email,
        firstName: name,
        identification: { type: docType, number: docNumber },
      },
      cardholderName: name,
      __mock: true,
      __mockPaymentId: fakePaymentId,
    }

    try {
      await onSubmit?.(cardFormData)
    } catch (err) {
      setError(err?.message || 'Error al procesar el pago')
      onError?.(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-5 sm:p-6">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 pb-1">
          <h3 className="text-base font-semibold text-neutral-900 leading-tight">
            Tarjeta de crédito o débito
          </h3>
          <BrandLogosRow />
        </div>

        {error && (
          <div
            className="border border-red-300 bg-red-50 text-red-800 text-sm rounded-md px-3 py-2"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="mp-cardnumber" className={labelClass}>
            Número de tarjeta
          </label>
          <div className="relative">
            <input
              id="mp-cardnumber"
              type="text"
              inputMode="numeric"
              autoComplete="cc-number"
              value={cardNumber}
              onChange={(e) =>
                setCardNumber(formatCardNumber(e.target.value, brand))
              }
              onBlur={() => setTouched((t) => ({ ...t, cardNumber: true }))}
              placeholder="1234 1234 1234 1234"
              className={`${inputClass} pr-14 tracking-wide`}
              disabled={submitting}
              aria-invalid={Boolean(touched.cardNumber && errors.cardNumber)}
            />
            {brand && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                <BrandLogo brand={brand} />
              </div>
            )}
          </div>
          <FieldError>{touched.cardNumber && errors.cardNumber}</FieldError>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="mp-expiry" className={labelClass}>
              Vencimiento
            </label>
            <input
              id="mp-expiry"
              type="text"
              inputMode="numeric"
              autoComplete="cc-exp"
              value={expiry}
              onChange={(e) => setExpiry(formatExpiry(e.target.value))}
              onBlur={() => setTouched((t) => ({ ...t, expiry: true }))}
              placeholder="MM/AA"
              className={inputClass}
              disabled={submitting}
              aria-invalid={Boolean(touched.expiry && errors.expiry)}
            />
            <FieldError>{touched.expiry && errors.expiry}</FieldError>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="mp-cvv"
                className="text-xs font-semibold text-neutral-700"
              >
                Código de seguridad
              </label>
              <button
                type="button"
                aria-label="¿Qué es el código de seguridad?"
                className="text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="relative">
              <input
                id="mp-cvv"
                type="text"
                inputMode="numeric"
                autoComplete="cc-csc"
                value={cvv}
                onChange={(e) =>
                  setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                onBlur={() => setTouched((t) => ({ ...t, cvv: true }))}
                placeholder="Ej.: 123"
                className={`${inputClass} pr-9`}
                disabled={submitting}
                aria-invalid={Boolean(touched.cvv && errors.cvv)}
              />
              <CreditCard
                className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
            </div>
            <FieldError>{touched.cvv && errors.cvv}</FieldError>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="mp-name" className={labelClass}>
            Nombre del titular tal y como aparece en la tarjeta
          </label>
          <input
            id="mp-name"
            type="text"
            autoComplete="cc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
            placeholder="María López"
            className={inputClass}
            disabled={submitting}
            aria-invalid={Boolean(touched.name && errors.name)}
          />
          <FieldError>{touched.name && errors.name}</FieldError>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Documento del titular</label>
          <div
            className={`flex border rounded-md overflow-hidden bg-white focus-within:ring-2 transition-colors ${
              touched.docNumber && errors.docNumber
                ? 'border-red-400 focus-within:ring-red-200 focus-within:border-red-400'
                : `border-neutral-300 focus-within:ring-[${MP_BLUE}]/30 focus-within:border-[${MP_BLUE}]`
            }`}
          >
            <div className="relative shrink-0">
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                disabled={submitting}
                aria-label="Tipo de documento"
                className="appearance-none bg-white pl-3 pr-7 py-2.5 text-sm text-neutral-900 focus:outline-none cursor-pointer disabled:bg-neutral-50 disabled:text-neutral-500"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="w-3.5 h-3.5 text-neutral-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
            </div>
            <div className="w-px bg-neutral-300 my-1.5" aria-hidden="true" />
            <input
              type="text"
              inputMode="numeric"
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value.replace(/\D/g, ''))}
              onBlur={() => setTouched((t) => ({ ...t, docNumber: true }))}
              placeholder="999999999"
              disabled={submitting}
              aria-label="Número de documento"
              aria-invalid={Boolean(touched.docNumber && errors.docNumber)}
              className="flex-1 min-w-0 px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none bg-white disabled:bg-neutral-50"
            />
          </div>
          <FieldError>{touched.docNumber && errors.docNumber}</FieldError>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-xs text-neutral-600">Completa tu información</p>
          <label htmlFor="mp-email" className={labelClass}>
            E-mail
          </label>
          <div className="relative">
            <Mail
              className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="mp-email"
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              placeholder="ejemplo@email.com"
              className={`${inputClass} pl-9`}
              disabled={submitting}
              aria-invalid={Boolean(touched.email && errors.email)}
            />
          </div>
          <FieldError>{touched.email && errors.email}</FieldError>
        </div>

        <button
          type="submit"
          disabled={!isFormValid || submitting}
          className={`w-full py-3 rounded-md font-semibold text-sm text-white flex items-center justify-center gap-2 transition-colors mt-1 ${
            !isFormValid || submitting
              ? 'bg-neutral-300 cursor-not-allowed'
              : 'hover:brightness-95'
          }`}
          style={{
            backgroundColor:
              !isFormValid || submitting ? undefined : MP_BLUE,
          }}
          onMouseEnter={(e) => {
            if (!(!isFormValid || submitting)) {
              e.currentTarget.style.backgroundColor = MP_BLUE_HOVER
            }
          }}
          onMouseLeave={(e) => {
            if (!(!isFormValid || submitting)) {
              e.currentTarget.style.backgroundColor = MP_BLUE
            }
          }}
        >
          {submitting ? (
            <>
              <svg
                className="animate-spin w-4 h-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Procesando...</span>
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" aria-hidden="true" />
              <span>Pagar</span>
            </>
          )}
        </button>

        <p className="text-[11px] text-neutral-500 text-center leading-relaxed">
          Al hacer click en &quot;Pagar&quot; aceptas los Términos y
          condiciones y la Política de privacidad de Mercado Pago.
        </p>

        <details className="text-[11px] text-neutral-500 leading-relaxed">
          <summary className="cursor-pointer select-none hover:text-neutral-700">
            Modo test · tarjetas y palabras mágicas
          </summary>
          <div className="mt-2 space-y-2 px-2 py-2 bg-neutral-50 border border-neutral-200 rounded-md text-left">
            <p>
              <span className="font-semibold text-neutral-700">Tarjetas de prueba (Perú):</span>{' '}
              Mastercard <span className="font-mono">5031 7557 3453 0604</span> ·
              Visa <span className="font-mono">4009 1753 3280 6176</span> ·
              Amex <span className="font-mono">3711 803032 57522</span>
            </p>
            <p>
              <span className="font-semibold text-neutral-700">Estados (en el nombre del titular):</span>
            </p>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono">
              <li><span className="text-green-700">APRO</span> aprobado</li>
              <li><span className="text-red-700">OTHE</span> error general</li>
              <li><span className="text-amber-700">CONT</span> pendiente</li>
              <li><span className="text-red-700">CALL</span> llamar p/autorizar</li>
              <li><span className="text-red-700">FUND</span> fondos insuficientes</li>
              <li><span className="text-red-700">SECU</span> CVV inválido</li>
              <li><span className="text-red-700">EXPI</span> fecha inválida</li>
              <li><span className="text-red-700">FORM</span> error de formulario</li>
            </ul>
          </div>
        </details>
      </form>
    </div>
  )
}
