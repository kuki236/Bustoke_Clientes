import SearchBar from './SearchBar'

const HERO_BG =
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=2000&q=80'

export default function Hero({ values, onChange, onSearch }) {
  return (
    <section
      className="hidden md:flex relative w-full min-h-[calc(100vh-64px)] bg-cover bg-center bg-no-repeat flex-col items-center px-6 pt-20 pb-72"
      style={{
        backgroundImage: `linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.45)), url('${HERO_BG}')`,
      }}
    >
      <div className="text-center text-white max-w-2xl mb-8">
        <h1 className="text-5xl font-medium tracking-tight">
          Tu viaje comienza aquí.
        </h1>
        <p className="mt-4 text-lg text-white/90 max-w-xl mx-auto">
          Reserva tus boletos de bus de forma rápida, segura y al mejor precio.
        </p>
      </div>

      <div className="w-full max-w-6xl">
        <SearchBar values={values} onChange={onChange} onSearch={onSearch} />
      </div>
    </section>
  )
}
