import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, MapPin } from 'lucide-react'
import {
  CIUDADES_DISPONIBLES,
  getTerminalById,
  resolveTerminalId,
} from '../data/terminales'

function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function isCityValue(value) {
  if (value === null || value === undefined) return false
  const str = String(value)
  if (!str) return false
  if (/^\d+$/.test(str)) return false
  return CIUDADES_DISPONIBLES.some((c) => normalize(c) === normalize(str))
}

function getExcludeCity(excludeId) {
  if (excludeId === null || excludeId === undefined) return null
  const str = String(excludeId)
  if (!str) return null
  if (/^\d+$/.test(str)) {
    const terminal = getTerminalById(str)
    return terminal ? terminal.ciudad : null
  }
  if (CIUDADES_DISPONIBLES.some((c) => normalize(c) === normalize(str))) {
    return str
  }
  return null
}

export default function Autocomplete({
  label,
  value,
  onChange,
  placeholder = 'Selecciona una ciudad',
  excludeId = null,
}) {
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const listboxId = useId()

  const excludeCity = getExcludeCity(excludeId)
  const valueIsCity = isCityValue(value)
  const resolvedId = !valueIsCity ? resolveTerminalId(value) : null
  const selectedCity = valueIsCity
    ? String(value)
    : (getTerminalById(resolvedId)?.ciudad ?? '')

  const displayValue = open ? draft : selectedCity

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false)
        setDraft('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const matchingCities = useMemo(() => {
    const q = normalize(draft)
    return CIUDADES_DISPONIBLES.filter((city) => {
      if (excludeCity && normalize(city) === normalize(excludeCity)) return false
      if (!q) return true
      return normalize(city).includes(q)
    })
  }, [draft, excludeCity])

  function handleSelect(city) {
    onChange?.(city, { type: 'city', city })
    setOpen(false)
    setDraft('')
    setHighlight(0)
    inputRef.current?.blur()
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setHighlight((idx) =>
        matchingCities.length === 0
          ? 0
          : Math.min(idx + 1, matchingCities.length - 1),
      )
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((idx) => Math.max(idx - 1, 0))
    } else if (event.key === 'Enter') {
      if (open && matchingCities[highlight]) {
        event.preventDefault()
        handleSelect(matchingCities[highlight])
      }
    } else if (event.key === 'Escape') {
      setOpen(false)
      setDraft('')
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col gap-1 min-w-0 flex-1"
    >
      <label className="text-xs font-medium text-neutral-500">{label}</label>
      <div className="flex items-center gap-2 min-w-0">
        <MapPin className="w-4 h-4 text-neutral-500 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true)
            setDraft('')
            setHighlight(0)
          }}
          onChange={(event) => {
            setDraft(event.target.value)
            setOpen(true)
            setHighlight(0)
          }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          autoComplete="off"
          className="bg-transparent outline-none text-neutral-900 font-medium w-full min-w-0 placeholder:text-neutral-400"
        />
        <ChevronDown className="w-4 h-4 text-neutral-500 shrink-0" />
      </div>

      {open && matchingCities.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-neutral-200 rounded-xl shadow-xl max-h-60 overflow-y-auto py-1"
        >
          {matchingCities.map((city, index) => (
            <li
              key={city}
              role="option"
              aria-selected={index === highlight}
              onMouseDown={(event) => {
                event.preventDefault()
                handleSelect(city)
              }}
              onMouseEnter={() => setHighlight(index)}
              className={`text-sm text-neutral-800 px-4 py-2.5 cursor-pointer transition-colors ${
                index === highlight ? 'bg-neutral-100' : 'hover:bg-neutral-100'
              }`}
            >
              {city}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
