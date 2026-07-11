// ============================================================================
// Spec 02 — Selección y bloqueo de asientos (RF-05).
//
// Cubre el flujo crítico del mapa interactivo del bus:
//   1) Sembrar un usuario vía API y autenticarlo.
//   2) Sembrar/descubrir un viaje vía /v1/travels/search.
//   3) Navegar a /viaje/:id_viaje/asientos.
//   4) Esperar a que cargue el mapa (`aria-label="Frente del bus"`).
//   5) Click en un asiento libre → POST /v1/seats/hold → 201.
//   6) Verificar que el asiento queda en estado "seleccionado".
//   7) Verificar que aparece el badge de "Tiempo restante de reserva".
//   8) Click de nuevo → POST /v1/seats/release → 200 (liberar).
//   9) Test negativo: click en asiento ocupado está disabled.
//
// Selectores clave (derivados del código en SeatSelectionPage.jsx:248-254):
//   - Mapa cargado:    [aria-label="Frente del bus"]
//   - Asiento libre:   button[aria-label^="Asiento"][aria-label$="libre"]
//   - Asiento ocupado: button[aria-label^="Asiento"][aria-label$="ocupado"]
//   - Timer:           [aria-label*="Tiempo restante"]
// ============================================================================

describe('Selección y bloqueo de asientos (SeatSelection)', () => {
  let idViaje
  let tokenSesion

  before(() => {
    cy.verificarAPI()
  })

  beforeEach(() => {
    // Generamos un token de sesión de asiento único por test para
    // que holds de specs anteriores no contaminen este.
    tokenSesion = `sess-cy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  /**
   * Helper: siembra el escenario (usuario logueado + viaje conocido)
   * usando los aliases `usuarioRegistrado` y `primerViaje` que dejan
   * los custom commands. Devuelve el `id_viaje` mediante la variable
   * de closure `idViaje`.
   */
  function setupEscenario() {
    // Encadenamos los 3 helpers: registrar → login → buscar viaje.
    // Cada uno deja un alias al final. Usamos `cy.then` con un
    // closure para acceder al alias en orden.
    cy.registrarPasajero()
    cy.get('@usuarioRegistrado').then((usuario) => {
      cy.loginAPI(usuario.email, usuario.contrasena)
      cy.get('@loginResult').then(() => {
        cy.buscarPrimerViaje()
        cy.get('@primerViaje').then((viaje) => {
          idViaje = viaje.id_viaje
        })
      })
    })
  }

  it('carga el mapa de asientos y muestra el frente del bus', () => {
    setupEscenario()
    cy.visit(`/viaje/${idViaje}/asientos`, { timeout: 60000 })

    cy.get('[aria-label="Frente del bus"]', { timeout: 10000 })
      .should('be.visible')
    cy.get('[aria-label="Baño"]').should('exist')
  })

  it('permite seleccionar un asiento libre y dispara POST /seats/hold', () => {
    setupEscenario()
    cy.visit(`/viaje/${idViaje}/asientos`, { timeout: 60000 })

    cy.get('[aria-label="Frente del bus"]', { timeout: 10000 })
      .should('be.visible')

    cy.intercept('POST', '**/v1/seats/hold').as('holdRequest')

    cy.get('button[aria-label^="Asiento"][aria-label$="libre"]', { timeout: 10000 })
      .first()
      .should('be.visible')
      .and('not.be.disabled')
      .click()

    cy.wait('@holdRequest', { timeout: 15000 }).then((interception) => {
      expect(interception.response.statusCode, 'status del hold').to.eq(201)
      const body = interception.response.body
      expect(body).to.have.property('estado', 'activo')
      expect(body).to.have.property('id_bloqueo')
      expect(body).to.have.property('id_viaje', idViaje)
    })

    cy.get('button[aria-label$="seleccionado"]', { timeout: 5000 })
      .should('have.length.at.least', 1)

    cy.get('[aria-label*="Tiempo restante"]', { timeout: 5000 })
      .should('be.visible')
  })

  it('libera un asiento seleccionado y dispara POST /seats/release', () => {
    setupEscenario()
    cy.visit(`/viaje/${idViaje}/asientos`, { timeout: 60000 })

    cy.get('[aria-label="Frente del bus"]', { timeout: 10000 })
      .should('be.visible')

    // Paso 1: seleccionar
    cy.get('button[aria-label^="Asiento"][aria-label$="libre"]')
      .first()
      .click()
    cy.get('button[aria-label$="seleccionado"]', { timeout: 5000 })
      .should('exist')

    // Paso 2: interceptar release y volver a clickear (toggle off)
    cy.intercept('POST', '**/v1/seats/release').as('releaseRequest')
    cy.get('button[aria-label$="seleccionado"]').first().click()

    cy.wait('@releaseRequest', { timeout: 15000 }).then((interception) => {
      expect(interception.response.statusCode, 'status del release').to.eq(200)
      const body = interception.response.body
      expect(['liberado', 'sin_bloqueo']).to.include(body.estado)
    })

    cy.get('button[aria-label$="seleccionado"]', { timeout: 5000 })
      .should('not.exist')
  })

  it('no permite click en asientos ocupados (botón disabled)', () => {
    setupEscenario()
    // Primero bloqueamos un asiento desde el API (sesión A).
    const tokenA = `sess-A-${Date.now()}`

    // Visitamos la página una vez para que el front-end pueda
    // hidratar `localStorage` con el access_token del usuario.
    cy.visit(`/viaje/${idViaje}/asientos`, { timeout: 60000 })
    cy.get('[aria-label="Frente del bus"]', { timeout: 10000 })
      .should('be.visible')

    // Obtenemos el primer id_asiento y bloqueamos desde una sesión A.
    cy.request({
      method: 'GET',
      url: `${Cypress.env('apiBaseUrl')}/travels/${idViaje}/seats`,
    }).then((resp) => {
      const idAsiento = resp.body.asientos[0].id_asiento

      // Sesión A lo bloquea. `failOnStatusCode: false` para que
      // un 409 (asiento ya bloqueado por un test previo que no
      // limpió) NO aborte el test — seguimos y validamos que el
      // botón está disabled de todos modos.
      cy.request({
        method: 'POST',
        url: `${Cypress.env('apiBaseUrl')}/seats/hold`,
        body: {
          id_viaje: idViaje,
          id_asiento: idAsiento,
          token_sesion: tokenA,
        },
        failOnStatusCode: false,
      }).then(() => {
        // Re-visitamos la página con el hold activo de sesión A.
        cy.visit(`/viaje/${idViaje}/asientos`, { timeout: 60000 })
        cy.get('[aria-label="Frente del bus"]', { timeout: 10000 })
          .should('be.visible')

        // El asiento bloqueado por sesión A debe aparecer como
        // "bloqueado" y estar disabled.
        cy.get('button[aria-label*="bloqueado"]', {
          timeout: 5000,
        })
          .first()
          .should('be.disabled')

        // Cleanup: que la sesión A no deje zombie holds.
        cy.request({
          method: 'POST',
          url: `${Cypress.env('apiBaseUrl')}/seats/release`,
          body: {
            id_viaje: idViaje,
            id_asiento: idAsiento,
            token_sesion: tokenA,
          },
        })
      })
    })
  })
})
