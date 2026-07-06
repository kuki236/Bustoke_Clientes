export const AGENCIES = [
  {
    id_agencia: 1,
    ruc: '20100234561',
    razon_social: 'PRESTACIONES DE SERVICIOS CRUZ DEL SUR S.A.C.',
    nombre: 'Cruz del Sur',
  },
  {
    id_agencia: 2,
    ruc: '20155432109',
    razon_social: 'TRANSPORTES OLTURSA S.A.C.',
    nombre: 'Oltursa',
  },
  {
    id_agencia: 3,
    ruc: '20100876543',
    razon_social: 'TURISMO CIVA S.A.C.',
    nombre: 'Civa',
  },
  {
    id_agencia: 4,
    ruc: '20300456789',
    razon_social: 'MOVIL BUS S.A.C.',
    nombre: 'Movil Bus',
  },
]

export const SEAT_TYPES = ['VIP', 'Normal']

export const SHIFTS = ['Mañana', 'Tarde', 'Noche']

export const PRICE_RANGE = { min: 30, max: 300 }

export const TIPO_SERVICIO_TO_BACKEND = {
  VIP: 'vip',
  Normal: 'normal',
}

export const TIPO_SERVICIO_FROM_BACKEND = {
  vip: 'VIP',
  normal: 'Normal',
}

export const TURNO_TO_BACKEND = {
  Mañana: 'manana',
  Tarde: 'tarde',
  Noche: 'noche',
}

export const TURNO_FROM_BACKEND = {
  manana: 'Mañana',
  tarde: 'Tarde',
  noche: 'Noche',
}
