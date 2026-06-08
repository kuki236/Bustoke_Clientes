export const TERMINALES = [
  {
    id_terminal: 1,
    ciudad: 'Lima',
    nombre: 'Terminal Terrestre Plaza Norte',
    direccion: 'Av. Tomás Valle 1530, Independencia - Lima',
  },
  {
    id_terminal: 2,
    ciudad: 'Lima',
    nombre: 'Terminal Javier Prado - Cruz del Sur',
    direccion: 'Av. Javier Prado Este 1109, San Borja - Lima',
  },
  {
    id_terminal: 3,
    ciudad: 'Lima',
    nombre: 'Terminal Civa La Victoria',
    direccion: 'Av. Paseo de la República 569, La Victoria - Lima',
  },
  {
    id_terminal: 4,
    ciudad: 'Trujillo',
    nombre: 'Terminal Terrestre de Trujillo',
    direccion: 'Panamericana Norte Km. 558, Trujillo',
  },
  {
    id_terminal: 5,
    ciudad: 'Arequipa',
    nombre: 'Terrapuerto Arequipa',
    direccion: 'Av. Arturo Ibáñez s/n, Jacobo Hunter - Arequipa',
  },
  {
    id_terminal: 6,
    ciudad: 'Chiclayo',
    nombre: 'Terminal Terrestre de Chiclayo',
    direccion: 'Av. Augusto B. Leguía 1910, Chiclayo',
  },
  {
    id_terminal: 7,
    ciudad: 'Cusco',
    nombre: 'Terminal Terrestre de Cusco',
    direccion: 'Av. Valle Sagrado de los Incas, Santiago - Cusco',
  },
  {
    id_terminal: 8,
    ciudad: 'Huancayo',
    nombre: 'Terminal Terrestre de Huancayo',
    direccion: 'Av. Evitamiento s/n, El Tambo - Huancayo',
  },
]

const CIUDAD_PRINCIPAL = {
  Lima: 2,
  Trujillo: 4,
  Arequipa: 5,
  Chiclayo: 6,
  Cusco: 7,
  Huancayo: 8,
}

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

const PRINCIPAL_NORMALIZED = Object.fromEntries(
  Object.entries(CIUDAD_PRINCIPAL).map(([ciudad, id]) => [
    normalizar(ciudad),
    id,
  ]),
)

const TERMINAL_BY_ID = new Map(TERMINALES.map((t) => [t.id_terminal, t]))

export function resolveTerminalId(input) {
  if (input === null || input === undefined || input === '') return null
  const asNumber = Number(input)
  if (Number.isInteger(asNumber) && asNumber > 0 && TERMINAL_BY_ID.has(asNumber)) {
    return asNumber
  }
  const key = normalizar(input)
  if (!key) return null
  if (PRINCIPAL_NORMALIZED[key]) return PRINCIPAL_NORMALIZED[key]
  const byCity = TERMINALES.find((t) => normalizar(t.ciudad) === key)
  if (byCity) return byCity.id_terminal
  const byName = TERMINALES.find((t) => normalizar(t.nombre).includes(key))
  if (byName) return byName.id_terminal
  return null
}

export function getTerminalById(idTerminal) {
  return TERMINAL_BY_ID.get(Number(idTerminal)) || null
}

export const CIUDADES_DISPONIBLES = Array.from(
  new Set(TERMINALES.map((t) => t.ciudad)),
)
