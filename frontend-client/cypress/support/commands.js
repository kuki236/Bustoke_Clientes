// ============================================================================
// Custom commands para los tests E2E de Bustoke.
//
// IMPORTANTE: TODAS las llamadas a `cy.request()` usan
// `Cypress.env('apiBaseUrl')` (configurado en cypress.config.js) en
// vez de URLs hardcoded. Esto evita acoplar los tests al entorno
// de Render y permite alternar entre local y staging solo cambiando
// la variable de entorno `CYPRESS_API_URL`.
//
// NOTA sobre Cypress 14: ya no usamos `cy.request(...).then()` ni
// `return` de chainers en los `Cypress.Commands.add`. En su lugar
// usamos Promises nativas envueltas en `cy.then` solo para
// sincronización, evitando el error "mixing up async and sync code".
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
  // NO usamos fixtures, el payload viaja en línea para
  // máxima legibilidad y para que el test sea self-contained.
  //
  // Patrón Cypress 14: cy.request retorna un chainer. Usamos
  // .then() para acceder a `resp`, pero NO retornamos el objeto
  // de datos (que sería un objeto JS, no un chainer). En su
  // lugar lo guardamos en `this` (closure) o lo emitimos como
  // alias de Cypress.
  cy.request({
    method: 'POST',
    url: `${apiBaseUrl()}/auth/register`,
    body: payload,
    failOnStatusCode: false,
  }).then((resp) => {
    expect(resp.status, `registro de ${email}`).to.eq(201)
    // Guardamos el body en el alias `usuarioRegistrado` para que
    // el caller pueda recuperarlo con `.as('usuarioRegistrado')`.
    const body = resp.body
    cy.log(`✅ Registrado ${email} (id_usuario=${body.usuario.id_usuario})`)
    cy.wrap({
      ...payload,
      id_usuario: body.usuario.id_usuario,
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    }).as('usuarioRegistrado')
  })
})

/**
 * Inicia sesión vía API y guarda los tokens en localStorage. Útil
 * para tests que no quieren ejercer el formulario de login.
 *
 * Por defecto AUTENTICA al usuario pero NO visita la página.
 */
Cypress.Commands.add('loginAPI', (email, password) => {
  cy.request({
    method: 'POST',
    url: `${apiBaseUrl()}/auth/login`,
    body: { email, password },
    failOnStatusCode: false,
  }).then((resp) => {
    expect(resp.status, `login de ${email}`).to.eq(200)
    const { access_token, refresh_token, usuario } = resp.body
    // Simulamos lo que hace AuthContext al hacer login:
    // guarda tokens en localStorage con las claves que usa
    // axiosInstance.js.
    cy.window().then((win) => {
      win.localStorage.setItem('bustoke_access_token', access_token)
      win.localStorage.setItem('bustoke_refresh_token', refresh_token)
      win.localStorage.setItem('bustoke_user', JSON.stringify(usuario))
    })
    cy.log(`🔐 Login OK ${email}`)
    cy.wrap({ access_token, refresh_token, usuario }).as('loginResult')
  })
})

/**
 * Busca un viaje vía API y devuelve el primer id_viaje encontrado.
 * Lo expone como alias `primerViaje` para que el caller lo use con
 * `cy.get('@primerViaje')`.
 */
Cypress.Commands.add('buscarPrimerViaje', (overrides = {}) => {
  const hoy = new Date()
  hoy.setDate(hoy.getDate() + 1) // mañana
  const fecha = overrides.fecha_salida || hoy.toISOString().slice(0, 10)

  // Si el caller no provee origen/destino, usamos IDs que el frontend
  // resuelve para Lima→Trujillo (2→4, ver terminales.js CIUDAD_PRINCIPAL).
  // `seed_e2e.py` (CI) crea justo la ruta 2→4. Para tests locales con
  // otra BD (e.g. sembrada con `seed_viajes.py` que usa 1→4), el caller
  // puede override via `cy.buscarPrimerViaje({ id_terminal_origen: X, id_terminal_destino: Y })`.
  const params = {
    id_terminal_origen: overrides.id_terminal_origen || 2,
    id_terminal_destino: overrides.id_terminal_destino || 4,
    fecha_salida: fecha,
  }
  cy.request({
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
    cy.wrap(viaje).as('primerViaje')
  })
})

/**
 * Verifica la salud del backend antes de empezar. Útil como
 * precondición al inicio de un spec crítico.
 */
Cypress.Commands.add('verificarAPI', () => {
  cy.request({
    method: 'GET',
    url: `${apiBaseUrl().replace(/\/v1$/, '')}/health`,
    timeout: 60000, // cold start de Render puede tardar 30s+
  }).then((resp) => {
    expect(resp.status, 'health check del backend').to.eq(200)
    expect(resp.body.status, 'status del health check').to.eq('healthy')
    cy.log('💚 Backend saludable')
  })
})
