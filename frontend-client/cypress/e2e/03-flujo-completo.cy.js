// ============================================================================
// Spec 03 — Flujo completo: Búsqueda + Selección de asiento (happy path).
//
// E2E end-to-end que combina los dos specs anteriores en un solo journey
// de usuario, simulando el comportamiento real de un pasajero:
//
//   1) Abre la landing.
//   2) Completa el formulario de búsqueda (origen + destino + fecha).
//   3) Click en "Buscar Buses" → navega a /buses.
//   4) Espera a que se rendericen los resultados.
//   5) Click en "Elegir Asientos" de la primera card.
//   6) Espera a que cargue el mapa de asientos.
//   7) Selecciona 2 asientos libres.
//   8) Verifica que aparece el botón de continuar al checkout.
//   9) Toma un screenshot final del estado completo (debugging visual).
//
// Este spec es el "smoke test de integración": si pasa, las piezas
// básicas (routing, API, mapa, hold) están todas conectadas.
// ============================================================================

describe('Flujo completo: Búsqueda → Selección de asientos', () => {
  before(() => {
    cy.verificarAPI()
  })

  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  it('happy path: usuario busca, encuentra viaje y selecciona 2 asientos', () => {
    // ----------------------------------------------------------------
    // PASO 1: Landing
    // ----------------------------------------------------------------
    cy.visit('/', { timeout: 60000 })
    cy.get('input[placeholder*="ciudad de salida" i]', { timeout: 10000 })
      .eq(0)
      .should('be.visible')

    // ----------------------------------------------------------------
    // PASO 2: Formulario de búsqueda
    // ----------------------------------------------------------------
    // Origen (eq(0) para tomar el del SearchBar, no el del MobileSearchCard)
    cy.get('input[placeholder*="ciudad de salida" i]')
      .eq(0)
      .click()
      .type('Lima')
    cy.get('ul[role="listbox"]', { timeout: 10000 })
      .first()
      .should('be.visible')
      .within(() => {
        cy.get('li[role="option"]').first().click()
      })

    // Destino
    cy.get('input[placeholder*="ciudad de destino" i]')
      .eq(0)
      .click()
      .type('Trujillo')
    cy.get('ul[role="listbox"]')
      .first()
      .should('be.visible')
      .within(() => {
        cy.get('li[role="option"]').first().click()
      })

    // Fecha: mañana — usamos `clear().type(fechaIso)` para que React
    // detecte el cambio via synthetic events.
    const manana = new Date()
    manana.setDate(manana.getDate() + 1)
    const fechaIso = manana.toISOString().slice(0, 10)
    cy.get('input[type="date"]')
      .eq(0)
      .clear()
      .type(fechaIso)

    // ----------------------------------------------------------------
    // PASO 3: Submit
    // ----------------------------------------------------------------
    // `eq(0)` para evitar "2 elements" cuando hay botón desktop y mobile.
    cy.contains(/buscar buses/i).eq(0).click()

    // ----------------------------------------------------------------
    // PASO 4: Resultados
    // ----------------------------------------------------------------
    cy.url({ timeout: 30000 }).should('include', '/buses')

    // ----------------------------------------------------------------
    // PASO 5: Click en "Elegir Asientos" de la primera card
    // ----------------------------------------------------------------
    cy.contains('button', /elegir asientos/i, { timeout: 15000 })
      .first()
      .should('be.visible')
      .click()

    // ----------------------------------------------------------------
    // PASO 6: Mapa de asientos
    // ----------------------------------------------------------------
    cy.url({ timeout: 30000 }).should('match', /\/viaje\/\d+\/asientos(\?|$)/)
    cy.get('[aria-label="Frente del bus"]', { timeout: 10000 })
      .should('be.visible')

    // ----------------------------------------------------------------
    // PASO 7: Seleccionar 2 asientos
    // ----------------------------------------------------------------
    // Capturamos la lista de asientos libres ANTES del primer click
    // para poder identificar el segundo libre por índice, sin
    // depender del `.next()` (frágil porque cambia el aria-label
    // del primer asiento tras el click).
    cy.get('button[aria-label^="Asiento"][aria-label$="libre"]', { timeout: 10000 })
      .then(($libresIniciales) => {
        expect($libresIniciales.length, 'asientos libres iniciales').to.be.at.least(2)

        // Primer asiento
        cy.intercept('POST', '**/v1/seats/hold').as('hold1')
        cy.wrap($libresIniciales.eq(0)).click()
        cy.wait('@hold1', { timeout: 15000 })
          .its('response.statusCode').should('eq', 201)

        // Segundo asiento: usamos el segundo nodo de la captura inicial
        // (no re-evaluamos la query porque el primero ya cambió de
        // estado a "seleccionado" y ya no matchea `[aria-label$="libre"]`).
        cy.intercept('POST', '**/v1/seats/hold').as('hold2')
        cy.wrap($libresIniciales.eq(1)).click({ force: true })
        cy.wait('@hold2', { timeout: 15000 })
          .its('response.statusCode').should('eq', 201)
      })

    // ----------------------------------------------------------------
    // PASO 8: Verificación final
    // ----------------------------------------------------------------
    cy.get('button[aria-label$="seleccionado"]', { timeout: 5000 })
      .should('have.length', 2)

    cy.get('[aria-label*="Tiempo restante"]', { timeout: 5000 })
      .should('be.visible')

    cy.contains('button', /continuar|checkout/i, { timeout: 5000 })
      .should('be.visible')
      .and('not.be.disabled')

    cy.screenshot('flujo-completo-final', { capture: 'fullPage' })

    cy.log('🎉 Flujo completo exitoso: 2 asientos seleccionados')
  })
})
