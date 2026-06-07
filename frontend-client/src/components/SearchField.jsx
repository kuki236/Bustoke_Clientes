import { ChevronDown, Calendar } from 'lucide-react'

export default function SearchField({
  label,
  value,
  placeholder,
  type = 'select',
  options = [],
  onChange,
}) {
  const wrapperClasses = 'flex flex-col gap-1 min-w-0 flex-1'

  if (type === 'date') {
    return (
      <div className={wrapperClasses}>
        <label className="text-xs font-medium text-neutral-500">{label}</label>
        <div className="flex items-center justify-between gap-2">
          <input
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange?.(e.target.value)}
            className="bg-transparent outline-none text-neutral-900 font-medium w-full placeholder:text-neutral-400"
          />
          <Calendar className="w-4 h-4 text-neutral-500 shrink-0" />
        </div>
      </div>
    )
  }

  if (type === 'number') {
    return (
      <div className={wrapperClasses}>
        <label className="text-xs font-medium text-neutral-500">{label}</label>
        <div className="flex items-center justify-between gap-2">
          <select
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            className="bg-transparent outline-none text-neutral-900 font-medium w-full appearance-none cursor-pointer"
          >
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-neutral-500 shrink-0" />
        </div>
      </div>
    )
  }

  return (
    <div className={wrapperClasses}>
      <label className="text-xs font-medium text-neutral-500">{label}</label>
      <button
        type="button"
        className="flex items-center justify-between gap-2 text-left"
      >
        <span className="text-neutral-900 font-medium truncate">
          {value || placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-neutral-500 shrink-0" />
      </button>
    </div>
  )
}
