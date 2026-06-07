const destinations = [
  {
    name: 'Cartagena',
    img: 'https://images.unsplash.com/photo-1583531352515-8884af319dc7?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Medellín',
    img: 'https://images.unsplash.com/photo-1664195074951-2a4ba645cf73?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Bogotá',
    img: 'https://images.unsplash.com/photo-1568632234157-ce7aecd03d0d?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Santa Marta',
    img: 'https://images.unsplash.com/photo-1591781914437-2c8db4f8b3c4?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'San Andrés',
    img: 'https://images.unsplash.com/photo-1559131397-f94da358f7ca?auto=format&fit=crop&w=800&q=80',
  },
]

export default function DestinationCarousel() {
  return (
    <div className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4">
      <div className="flex gap-4 pb-2 snap-x snap-mandatory">
        {destinations.map((d) => (
          <article
            key={d.name}
            className="relative w-64 h-36 rounded-2xl overflow-hidden shrink-0 shadow-card snap-start"
          >
            <img
              src={d.img}
              alt={d.name}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <span className="absolute left-3 bottom-3 text-white font-semibold text-lg">
              {d.name}
            </span>
          </article>
        ))}
      </div>
    </div>
  )
}
