import { AlertCircle, CheckCircle2 } from 'lucide-react'

const VARIANTS = {
  error: {
    container: 'border-red-200 bg-red-50 text-red-700',
    icon: 'text-red-500',
  },
  success: {
    container: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: 'text-emerald-500',
  },
  info: {
    container: 'border-blue-200 bg-blue-50 text-blue-700',
    icon: 'text-blue-500',
  },
}

export default function Alert({ variant = 'error', children, className = '', icon: Icon }) {
  const styles = VARIANTS[variant] || VARIANTS.error
  const ResolvedIcon = Icon ?? (variant === 'success' ? CheckCircle2 : AlertCircle)
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm leading-snug ${styles.container} ${className}`}
    >
      <ResolvedIcon className={`w-4 h-4 mt-0.5 shrink-0 ${styles.icon}`} strokeWidth={2} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
