import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const FAQ_ITEMS = [
  {
    id: 'baggage',
    question: '¿Cuánto equipaje puedo llevar?',
    answer:
      'Puedes llevar una maleta de mano y una maleta de bodega de hasta 20 kg sin costo extra.',
  },
  {
    id: 'changes',
    question: '¿Puedo cambiar la fecha de mi viaje?',
    answer:
      'Sí, puedes reprogramar tu viaje hasta 4 horas antes de la salida desde "Mis viajes".',
  },
  {
    id: 'payment',
    question: '¿Qué métodos de pago aceptan?',
    answer:
      'Aceptamos tarjetas débito y crédito, PSE y pagos por Nequi y Daviplata.',
  },
]

export default function FaqSection() {
  const [openId, setOpenId] = useState(null)

  const toggle = (id) => {
    setOpenId((current) => (current === id ? null : id))
  }

  return (
    <section className="mt-10" aria-labelledby="faq-title">
      <h2
        id="faq-title"
        className="text-neutral-900 font-semibold text-lg mb-4"
      >
        Preguntas frecuentes
      </h2>
      <ul className="flex flex-col gap-2">
        {FAQ_ITEMS.map(({ id, question, answer }) => {
          const isOpen = openId === id
          return (
            <li
              key={id}
              className="bg-white rounded-2xl shadow-card overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${id}`}
                className="w-full flex items-center justify-between gap-3 text-left p-4"
              >
                <span className="text-neutral-900 font-medium text-sm">
                  {question}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-neutral-500 shrink-0 transition-transform ${
                    isOpen ? 'rotate-180' : 'rotate-0'
                  }`}
                />
              </button>
              {isOpen && (
                <div
                  id={`faq-panel-${id}`}
                  className="px-4 pb-4 text-neutral-600 text-sm leading-snug"
                >
                  {answer}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
