import { Bus } from 'lucide-react'

export default function Navbar() {
  return (
    <nav className="hidden md:flex w-full bg-white border-b border-neutral-200 h-16 items-center px-8 sticky top-0 z-30">
      <div className="flex items-center gap-2 text-blue-600">
        <Bus className="w-6 h-6" />
        <span className="text-xl font-bold tracking-tight">BUSTOKE</span>
      </div>
    </nav>
  )
}
