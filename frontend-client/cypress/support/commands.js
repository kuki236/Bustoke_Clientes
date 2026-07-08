// ============================================================================
// Custom commands para los tests E2E de Bustoke.
//
// IMPORTANTE: TODAS las llamadas a `cy.request()` usan
// `Cypress.env('apiBaseUrl')` (configurado en cypress.config.js) en
// vez de URLs hardcoded. Esto evita acoplar los tests al entorno
// de Render y permite alternar entre local y staging solo cambiando
// la variable de entorno `CYPRESS_API_URL`.
// ============================================================================

// ----------------------------------------------------------------------------
// API Helpers (consumidos desde cy.request())
// ----------------------------------------------------------------------------

/**
 * Resuelve la URL base de la API. Lanza un error legible si no está
 * configurada, en vez de fallar con un 404 confuso más adelante.
 */
const apiBaseUrl = () => {
  const base = Cypress.env('apiBaseUrl')
  if (!base) {
    throw new Error(
      'apiBaseUrl no está configurada. Revisa cypress.config.js (setupNodeEvents) ' +
      'o exporta CYPRESS_API_URL antes de correr los tests.'
    )
  }
  return base.replace(/\/+$/, '') // sin slash final
}

/**
 * Genera credenciales únicas por test para evitar conflictos
 * de unicidad (uq_usuarios_email_lower) entre specs consecutivos.
 */
const uniqueEmail = (prefix = 'cy') => {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `${prefix}-${ts}-${rand}@bustoke-test.com`
}

const uniqueDoc = () => {
  // DNI peruano: 8 dígitos. Prefijo '7' + 7 aleatorios.
  return `7${Math.floor(1000000 + Math.random() * 8999999)}`
}

// ----------------------------------------------------------------------------
// Comandos principales
// ----------------------------------------------------------------------------

/**
 * Registra un pasajero vía API y guarda los tokens en localStorage.
 * Devuelve los datos del usuario (email, password, id_usuario, tokens).
 *
 * Uso:
 *   cy.registrarPasajero().then((usuario) => { ... })
 *   cy.registrarPasajero({ email: 'caso@x.com' })
 */
Cypress.Commands.add('registrarPasajero', (overrides = {}) => {
  const email = overrides.email || uniqueEmail('reg')
  const dni = overrides.numero_documento || uniqueDoc()
  const payload = {
    nombres: 'Cypress',
    apellido_paterno: 'Test',
    apellido_materno: 'E2E',
    tipo_documento: 'DNI',
    numero_documento: dni,
    telefono: '987654321',
    email,
    contrasena: 'CypressPass123!',
    ...overrides,
  }
  // Importante: NO usamos fixtures, el payload viaja en línea para
  // máxima legibilidad y para que el test sea self-contained.
  return cy.request({
    method: 'POST',
    url: `${apiBaseUrl()}/auth/register`,
    body: payload,
    failOnStatusCode: false,
  }).then((resp) => {
    expect(resp.status, `registro de ${email}`).to.eq(201)
    const body = resp.body
    cy.log(`✅ Registrado ${email} (id_usuario=${body.usuario.id_usuario})`)
    return {
      ...payload,
      id_usuario: body.usuario.id_usuario,
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    }
  })
})

/**
 * Inicia sesión vía API y guarda los tokens en localStorage. Útil
 * para tests que no quieren ejercer el formulario de login (eso lo
 * cubre el spec 03-flujo-completo).
 *
 * Por defecto AUTENTICA al usuario pero NO visita la página: el
 * caller decide cuándo navegar. Si quieres visitar después,
 * pasa `{ visit: '/' }`.
 */
Cypress.Commands.add('loginAPI', (email, password) => {
  return cy.request({
    method: 'POST',
    url: `${apiBaseUrl()}/auth/login`,
    body: { email, password },
    failOnStatusCode: false,
  }).then((resp) => {
    expect(resp.status, `login de ${email}`).to.eq(200)
    const { access_token, refresh_token, usuario } = resp.body
    // Simulamos lo que hace AuthContext al hacer login:
    // guarda tokens en localStorage con las claves que usa axiosInstance.js.
    cy.window().then((win) => {
      win.localStorage.setItem('bustoke_access_token', access_token)
      win.localStorage.setItem('bustoke_refresh_token', refresh_token)
      win.localStorage.setItem('bustoke_user', JSON.stringify(usuario))
    })
    cy.log(`🔐 Login OK ${email}`)
    return { access_token, refresh_token, usuario }
  })
})

/**
 * Busca un viaje vía API y devuelve el primer id_viaje encontrado.
 * Útil para preparar el escenario del spec de selección de asientos.
 *
 * NOTA: requiere que la BD tenga al menos un viaje sembrado
 * (lo que asume el entorno de staging de Render).
 */
Cypress.Commands.add('buscarPrimerViaje', (overrides = {}) => {
  const hoy = new Date()
  hoy.setDate(hoy.getDate() + 1) // mañana
  const fecha = overrides.fecha_salida || hoy.toISOString().slice(0, 10)

  // Si el caller no provee origen/destino, usamos IDs sentinela
  // (1 y 2 son los típicos de la BD sembrada en tests del backend).
  const params = {
    id_terminal_origen: overrides.id_terminal_origen || 1,
    id_terminal_destino: overrides.id_terminal_destino || 2,
    fecha_salida: fecha,
  }
  return cy.request({
    method: 'GET',
    url: `${apiBaseUrl()}/travels/search`,
    qs: params,
    failOnStatusCode: false,
  }).then((resp) => {
    if (resp.status !== 200) {
      throw new Error(`search devolvió ${resp.status}: ${JSON.stringify(resp.body)}`)
    }
    const resultados = resp.body
    if (!Array.isArray(resultados) || resultados.length === 0) {
      throw new Error(
        `No hay viajes sembrados para ${params.id_terminal_origen}→` +
        `${params.id_terminal_destino} en ${fecha}. ` +
        'Sembrar la BD antes de correr el spec.'
      )
    }
    const viaje = resultados[0]
    cy.log(`🚌 Viaje encontrado: id=${viaje.id_viaje} (${viaje.terminal_origen}→${viaje.terminal_destino})`)
    return viaje
  })
})

/**
 * Verifica la salud del backend antes de empezar. Útil como
 * precondición al inicio de un spec crítico. Si falla, el spec
 * se aborta con un mensaje claro (mejor que fallar a mitad con
 * un timeout confuso).
 */
Cypress.Commands.add('verificarAPI', () => {
  return cy.request({
    method: 'GET',
    url: `${apiBaseUrl().replace(/\/v1$/, '')}/health`,
    timeout: 60000, // cold start de Render puede tardar 30s+
  }).then((resp) => {
    expect(resp.status, 'health check del backend').to.eq(200)
    expect(resp.body.status, 'status del health check').to.eq('healthy')
    cy.log('💚 Backend saludable')
  })
})
