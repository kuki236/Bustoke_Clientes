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
//
// Manejo de cold starts de Render: timeout de 10s en selectores
// críticos + `cy.verificarAPI()` en before().
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
   * navegando programáticamente a la pantalla de selección.
   * Devuelve una promesa con el id_viaje.
   */
  function setupEscenario() {
    return cy.registrarPasajero().then((usuario) => {
      cy.loginAPI(usuario.email, usuario.contrasena)
      return cy.buscarPrimerViaje().then((viaje) => {
        idViaje = viaje.id_viaje
        return viaje
      })
    })
  }

  it('carga el mapa de asientos y muestra el frente del bus', () => {
    setupEscenario().then(() => {
      cy.visit(`/viaje/${idViaje}/asientos`, { timeout: 60000 })

      // El renderizado del mapa puede tardar si Render free
      // está en cold start. Usamos 10s como umbral.
      cy.get('[aria-label="Frente del bus"]', { timeout: 10000 })
        .should('be.visible')
      cy.get('[aria-label="Baño"]').should('exist')
    })
  })

  it('permite seleccionar un asiento libre y dispara POST /seats/hold', () => {
    setupEscenario().then(() => {
      cy.visit(`/viaje/${idViaje}/asientos`, { timeout: 60000 })

      // Esperamos a que el mapa esté listo.
      cy.get('[aria-label="Frente del bus"]', { timeout: 10000 })
        .should('be.visible')

      // Interceptamos la llamada al endpoint de hold ANTES del click.
      cy.intercept('POST', '**/v1/seats/hold').as('holdRequest')

      // Buscamos el primer asiento con estado 'libre'. Selector
      // estable basado en aria-label dinámico de SeatButton.
      cy.get('button[aria-label^="Asiento"][aria-label$="libre"]', { timeout: 10000 })
        .first()
        .should('be.visible')
        .and('not.be.disabled')
        .click()

      // Aserciones sobre la llamada HTTP:
      cy.wait('@holdRequest', { timeout: 15000 }).then((interception) => {
        expect(interception.response.statusCode, 'status del hold').to.eq(201)
        const body = interception.response.body
        expect(body).to.have.property('estado', 'activo')
        expect(body).to.have.property('id_bloqueo')
        expect(body).to.have.property('id_viaje', idViaje)
      })

      // Verificación visual: el asiento clickeado ahora debe estar
      // marcado como "seleccionado" (cambia el aria-label).
      cy.get('button[aria-label$="seleccionado"]', { timeout: 5000 })
        .should('have.length.at.least', 1)

      // Y debe aparecer el badge de tiempo restante.
      cy.get('[aria-label*="Tiempo restante"]', { timeout: 5000 })
        .should('be.visible')
    })
  })

  it('libera un asiento seleccionado y dispara POST /seats/release', () => {
    setupEscenario().then(() => {
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

      // Tras el release, el asiento vuelve a estado 'libre' o se queda
      // sin selección. Verificamos que NO hay asientos seleccionados.
      cy.get('button[aria-label$="seleccionado"]', { timeout: 5000 })
        .should('not.exist')
    })
  })

  it('no permite click en asientos ocupados (botón disabled)', () => {
    setupEscenario().then(() => {
      // Primero bloqueamos un asiento desde el API (sesión A).
      const tokenA = `sess-A-${Date.now()}`
      cy.get('button[aria-label^="Asiento"][aria-label$="libre"]', { timeout: 10000 })
        .should('exist')

      // Buscamos el primer id_asiento desde la API
      cy.request({
        method: 'GET',
        url: `${Cypress.env('apiBaseUrl')}/travels/${idViaje}/seats`,
      }).then((resp) => {
        const idAsiento = resp.body.asientos[0].id_asiento

        // Sesión A lo bloquea.
        return cy.request({
          method: 'POST',
          url: `${Cypress.env('apiBaseUrl')}/seats/hold`,
          body: {
            id_viaje: idViaje,
            id_asiento: idAsiento,
            token_sesion: tokenA,
          },
        }).then(() => {
          // Ahora visitamos la página con sesión B (el usuario actual).
          cy.visit(`/viaje/${idViaje}/asientos`, { timeout: 60000 })
          cy.get('[aria-label="Frente del bus"]', { timeout: 10000 })
            .should('be.visible')

          // El asiento bloqueado por sesión A debe aparecer como
          // "bloqueado" y estar disabled.
          cy.get(`button[aria-label$="${idAsiento} bloqueado"], button[aria-label*=" bloqueado"]`, {
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
})
