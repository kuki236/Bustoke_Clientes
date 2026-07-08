// ============================================================================
// Spec 01 — Búsqueda de viajes: Landing → Results.
//
// Cubre el happy path del flujo de búsqueda B2C (RF-03, RF-04):
//   1) El usuario aterriza en la landing y ve el SearchBar.
//   2) Completa origen, destino y fecha.
//   3) Pulsa "Buscar Buses" → la app navega a /buses.
//   4) El frontend hace GET /v1/travels/search con los parámetros correctos.
//   5) Se renderiza al menos un resultado (card de bus con precio y cupos).
//
// Aserciones clave:
//   - URL final: /buses (React Router 7).
//   - Status code de la API: 200 (interceptado con cy.intercept).
//   - Estructura del JSON: id_viaje, terminal_origen, asientos_libres.
//   - Selectores resilientes: usamos `aria-label` y placeholders estables
//     en lugar de clases CSS (que cambian con Tailwind recompiles).
// ============================================================================

describe('Búsqueda de viajes (Landing → Results)', () => {
  before(() => {
    // Precondición: el backend debe estar vivo. Si Render free está
    // dormido, este check fuerza el cold start y reporta un error
    // claro si el backend no responde en 60s.
    cy.verificarAPI()
  })

  beforeEach(() => {
    // Punto de partida limpio: localStorage sin tokens residuales.
    cy.clearLocalStorage()
    cy.visit('/', { timeout: 60000 })
  })

  it('muestra el formulario de búsqueda en la landing', () => {
    // El SearchBar (Hero en desktop) debe estar presente.
    // Usamos el placeholder exacto del SearchField "Origen" (SearchBar.jsx:48).
    cy.get('input[placeholder*="ciudad de salida" i]', { timeout: 10000 })
      .should('be.visible')
    cy.get('input[placeholder*="ciudad de destino" i]')
      .should('be.visible')
    cy.get('input[type="date"]')
      .should('exist')
  })

  it('realiza una búsqueda completa y renderiza al menos un resultado', () => {
    // -------------------------------------------------------------
    // PASO 1: Llenar Origen
    // -------------------------------------------------------------
    cy.get('input[placeholder*="ciudad de salida" i]')
      .should('be.visible')
      .click()
      .type('Lima')

    // El dropdown del Autocomplete se abre. Esperamos la primera
    // opción de ciudad (role="option") y la seleccionamos.
    cy.get('ul[role="listbox"]', { timeout: 10000 })
      .should('be.visible')
      .within(() => {
        cy.get('li[role="option"]').first().click()
      })

    // -------------------------------------------------------------
    // PASO 2: Llenar Destino
    // -------------------------------------------------------------
    cy.get('input[placeholder*="ciudad de destino" i]')
      .should('be.visible')
      .click()
      .type('Trujillo')

    cy.get('ul[role="listbox"]')
      .should('be.visible')
      .within(() => {
        cy.get('li[role="option"]').first().click()
      })

    // -------------------------------------------------------------
    // PASO 3: Setear fecha (mañana) via input nativo
    // -------------------------------------------------------------
    const manana = new Date()
    manana.setDate(manana.getDate() + 1)
    const fechaIso = manana.toISOString().slice(0, 10) // YYYY-MM-DD
    cy.get('input[type="date"]')
      .should('exist')
      .then(($input) => {
        // El input de fecha de Vite/React puede estar envuelto en un
        // overlay con opacity:0, así que disparamos el evento 'input'
        // directamente para bypassear problemas de click.
        cy.wrap($input).invoke('val', fechaIso).trigger('input').trigger('change')
      })

    // -------------------------------------------------------------
    // PASO 4: Interceptar la llamada a la API ANTES de submit
    // -------------------------------------------------------------
    cy.intercept('GET', '**/v1/travels/search*').as('searchRequest')

    // -------------------------------------------------------------
    // PASO 5: Submit del formulario
    // -------------------------------------------------------------
    cy.contains('button', /buscar buses/i).click()

    // -------------------------------------------------------------
    // PASO 6: Aserciones
    // -------------------------------------------------------------
    // a) Navegación a /buses (React Router)
    cy.url({ timeout: 30000 }).should('include', '/buses')

    // b) La API recibió la query con los parámetros correctos
    cy.wait('@searchRequest', { timeout: 30000 }).then((interception) => {
      expect(interception.response.statusCode, 'status del search').to.eq(200)
      const query = interception.request.query
      expect(query).to.have.property('id_terminal_origen')
      expect(query).to.have.property('id_terminal_destino')
      expect(query).to.have.property('fecha_salida', fechaIso)

      // c) El JSON de respuesta debe tener la forma esperada
      const body = interception.response.body
      if (Array.isArray(body) && body.length > 0) {
        const primer = body[0]
        expect(primer).to.have.property('id_viaje')
        expect(primer).to.have.property('terminal_origen')
        expect(primer).to.have.property('terminal_destino')
        expect(primer).to.have.property('asientos_libres')
        expect(primer.asientos_libres).to.be.greaterThan(0)
      } else {
        cy.log('⚠️  No hay viajes sembrados para esta combinación. El test pasó por aserciones de UI.')
      }
    })

    // d) La UI muestra al menos una card de bus con su precio.
    //    BusCardDesktop tiene el botón "Elegir Asientos" (no "Agotado").
    cy.contains('button', /elegir asientos/i, { timeout: 15000 })
      .should('exist')
  })

  it('muestra estado vacío cuando no hay viajes', () => {
    // Buscamos una combinación improbable: terminal 999 (no existe).
    // La API debe devolver 200 con array vacío y la UI debe mostrar
    // un mensaje de "no se encontraron resultados" (o equivalente).
    cy.intercept('GET', '**/v1/travels/search*', {
      statusCode: 200,
      body: [],
    }).as('searchEmpty')

    // Forzamos el submit directamente vía la URL con query params
    // (más estable que pelearse con el Autocomplete para IDs inválidos).
    cy.visit('/buses?id_terminal_origen=999&id_terminal_destino=998&fecha_salida=2027-01-01', {
      timeout: 30000,
    })
    cy.wait('@searchEmpty', { timeout: 30000 })
      .its('response.statusCode').should('eq', 200)

    // La UI debe mostrar un mensaje legible. No atamos al texto exacto
    // (puede cambiar) pero sí a la presencia de un contenedor con copy.
    cy.contains(/no encontr|sin resultados|no hay/i, { timeout: 10000 })
      .should('exist')
  })
})
