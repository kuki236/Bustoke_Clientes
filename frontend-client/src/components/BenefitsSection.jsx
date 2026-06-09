import { Ticket, QrCode, ShieldCheck } from 'lucide-react'

const BENEFITS = [
  {
    id: 'digital',
    title: 'Pasajes 100% Digitales',
    description: 'Olvídate de imprimir. Lleva tu tiquete en el celular.',
    icon: Ticket,
  },
  {
    id: 'qr',
    title: 'Embarque Seguro con QR',
    description: 'Sube al bus con un escaneo rápido y sin filas.',
    icon: QrCode,
  },
  {
    id: 'no-fees',
    title: 'Sin Comisiones Ocultas',
    description: 'Pagas exactamente el precio que ves al reservar.',
    icon: ShieldCheck,
  },
]

export default function BenefitsSection() {
  return (
    <section className="mt-10" aria-labelledby="benefits-title">
      <h2
        id="benefits-title"
        className="text-neutral-900 font-semibold text-lg mb-4"
      >
        ¿Por qué Bustoke?
      </h2>
      <ul className="grid grid-cols-1 gap-3">
        {BENEFITS.map(({ id, title, description, icon: Icon }) => (
          <li
            key={id}
            className="bg-white rounded-2xl shadow-card p-4 flex items-start gap-3"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 text-blue-600 shrink-0">
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-neutral-900 font-semibold text-sm">
                {title}
              </h3>
              <p className="text-neutral-500 text-sm leading-snug mt-0.5">
                {description}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
