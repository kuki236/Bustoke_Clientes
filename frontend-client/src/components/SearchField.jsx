import { useId, useRef } from 'react'
import { Calendar } from 'lucide-react'
import { formatDateToDDMMYYYY } from '../api/travels'

export default function SearchField({
  label,
  value,
  placeholder,
  type = 'text',
  options = [],
  onChange,
  min,
  max,
}) {
  const wrapperClasses = 'flex flex-col gap-1 min-w-0 flex-1'

  if (type === 'date') {
    return <DateField
      label={label}
      value={value}
      placeholder={placeholder}
      min={min}
      max={max}
      onChange={onChange}
      wrapperClasses={wrapperClasses}
    />
  }

  if (type === 'select') {
    return (
      <div className={wrapperClasses}>
        <label className="text-xs font-medium text-neutral-500">{label}</label>
        <select
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          className="bg-transparent outline-none text-neutral-900 font-medium w-full cursor-pointer"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className={wrapperClasses}>
      <label className="text-xs font-medium text-neutral-500">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange?.(event.target.value)}
        className="bg-transparent outline-none text-neutral-900 font-medium w-full placeholder:text-neutral-400"
      />
    </div>
  )
}

function DateField({ label, value, placeholder, min, max, onChange, wrapperClasses }) {
  const inputId = useId()
  const inputRef = useRef(null)

  const tryOpenPicker = (input) => {
    if (!input || typeof input.showPicker !== 'function') return
    try {
      input.showPicker()
    } catch (err) {
// FIX showPicker NotAllowedError:

    }
  }

  const handleClick = (e) => {
    tryOpenPicker(e.currentTarget)
  }

  const handleMouseDown = (e) => {
    tryOpenPicker(e.currentTarget)
  }

  return (
    <div className={wrapperClasses}>
      <label htmlFor={inputId} className="text-xs font-medium text-neutral-500">
        {label}
      </label>
      <div className="relative flex items-center gap-2 min-w-0 rounded-md focus-within:ring-2 focus-within:ring-blue-500/40">
        <span
          className={`font-medium truncate pointer-events-none ${
            value ? 'text-neutral-900' : 'text-neutral-400'
          }`}
        >
          {value
            ? formatDateToDDMMYYYY(value)
            : placeholder || 'DD/MM/AAAA'}
        </span>
        <Calendar className="w-4 h-4 text-neutral-500 shrink-0 ml-auto pointer-events-none" />
        <input
          ref={inputRef}
          id={inputId}
          type="date"
          value={value || ''}
          min={min}
          max={max}
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          onChange={(event) => onChange?.(event.target.value)}
          aria-label={label}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
      </div>
    </div>
  )
}
