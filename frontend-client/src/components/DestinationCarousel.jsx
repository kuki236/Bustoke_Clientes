const destinations = [
  {
    id_terminal: 4,
    name: 'Trujillo',
    description: 'La Ciudad de la Eterna Primavera y las huacas de Chan Chan.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/e/ed/Freedom_Monument%2C_Trujillo.jpg',
  },
  {
    id_terminal: 5,
    name: 'Arequipa',
    description: 'Descubre la Ciudad Blanca y el imponente Cañón del Colca.',
    img: 'https://www.amarujourneyperu.com/blog/wp-content/uploads/plazaarequipa1.webp',
  },
  {
    id_terminal: 7,
    name: 'Cusco',
    description: 'El ombligo del mundo y la majestuosidad de Machu Picchu.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Machu_Picchu%2C_Peru_%282018%29.jpg/1280px-Machu_Picchu%2C_Peru_%282018%29.jpg',
  },
]

export default function DestinationCarousel({ onSelect }) {
  return (
    <div
      className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none gap-4 px-4 -mx-4 pb-2"
      style={{ scrollbarWidth: 'none' }}
    >
      {destinations.map((d) => (
        <button
          key={d.id_terminal}
          type="button"
          onClick={() => onSelect?.(d)}
          className="relative shrink-0 snap-start overflow-hidden rounded-2xl shadow-card h-48 w-[78%] text-left cursor-pointer hover:scale-[1.02] active:scale-[0.99] transition-transform"
        >
          <img
            src={d.img}
            alt={d.name}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-3 flex flex-col gap-1">
            <span className="text-white font-semibold text-lg">{d.name}</span>
            <span className="text-white/85 text-xs leading-snug">
              {d.description}
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}
