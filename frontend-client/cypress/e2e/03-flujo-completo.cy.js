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
      .should('be.visible')

    // ----------------------------------------------------------------
    // PASO 2: Formulario de búsqueda
    // ----------------------------------------------------------------
    // Origen
    cy.get('input[placeholder*="ciudad de salida" i]')
      .click()
      .type('Lima')
    cy.get('ul[role="listbox"]', { timeout: 10000 })
      .should('be.visible')
      .within(() => {
        cy.get('li[role="option"]').first().click()
      })

    // Destino
    cy.get('input[placeholder*="ciudad de destino" i]')
      .click()
      .type('Trujillo')
    cy.get('ul[role="listbox"]')
      .should('be.visible')
      .within(() => {
        cy.get('li[role="option"]').first().click()
      })

    // Fecha: mañana
    const manana = new Date()
    manana.setDate(manana.getDate() + 1)
    const fechaIso = manana.toISOString().slice(0, 10)
    cy.get('input[type="date"]')
      .invoke('val', fechaIso)
      .trigger('input')
      .trigger('change')

    // ----------------------------------------------------------------
    // PASO 3: Submit
    // ----------------------------------------------------------------
    cy.intercept('GET', '**/v1/travels/search*').as('search')
    cy.contains('button', /buscar buses/i).click()

    // ----------------------------------------------------------------
    // PASO 4: Resultados
    // ----------------------------------------------------------------
    cy.url({ timeout: 30000 }).should('include', '/buses')
    cy.wait('@search', { timeout: 30000 })
      .its('response.statusCode').should('eq', 200)

    // ----------------------------------------------------------------
    // PASO 5: Click en "Elegir Asientos" de la primera card
    // ----------------------------------------------------------------
    // Si el search devolvió resultados, debe haber al menos una card
    // con un botón "Elegir Asientos" (no "Agotado").
    cy.contains('button', /elegir asientos/i, { timeout: 15000 })
      .should('be.visible')
      .first()
      .click()

    // ----------------------------------------------------------------
    // PASO 6: Mapa de asientos
    // ----------------------------------------------------------------
    // La navegación va a /viaje/:id_viaje/asientos. Esperamos al
    // renderizado del mapa (con tolerancia a cold start).
    cy.url({ timeout: 30000 }).should('match', /\/viaje\/\d+\/asientos$/)
    cy.get('[aria-label="Frente del bus"]', { timeout: 10000 })
      .should('be.visible')

    // ----------------------------------------------------------------
    // PASO 7: Seleccionar 2 asientos
    // ----------------------------------------------------------------
    cy.intercept('POST', '**/v1/seats/hold').as('hold1')
    cy.get('button[aria-label^="Asiento"][aria-label$="libre"]', { timeout: 10000 })
      .first()
      .click()
    cy.wait('@hold1', { timeout: 15000 })
      .its('response.statusCode').should('eq', 201)

    // Segundo asiento (el siguiente libre después del primero)
    cy.intercept('POST', '**/v1/seats/hold').as('hold2')
    cy.get('button[aria-label^="Asiento"][aria-label$="libre"]')
      .first() // Después del primer click, el primero ahora es el "seleccionado"
      .next()
      .click({ force: true })
    cy.wait('@hold2', { timeout: 15000 })
      .its('response.statusCode').should('eq', 201)

    // ----------------------------------------------------------------
    // PASO 8: Verificación final
    // ----------------------------------------------------------------
    // Deben haber 2 asientos seleccionados.
    cy.get('button[aria-label$="seleccionado"]', { timeout: 5000 })
      .should('have.length', 2)

    // El badge de tiempo restante debe estar visible.
    cy.get('[aria-label*="Tiempo restante"]', { timeout: 5000 })
      .should('be.visible')

    // El botón de continuar al checkout debe estar habilitado.
    cy.contains('button', /continuar|checkout/i, { timeout: 5000 })
      .should('be.visible')
      .and('not.be.disabled')

    // Screenshot final para debugging visual del journey.
    cy.screenshot('flujo-completo-final', { capture: 'fullPage' })

    cy.log('🎉 Flujo completo exitoso: 2 asientos seleccionados')
  })
})
