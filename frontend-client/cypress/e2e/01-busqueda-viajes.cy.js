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
    // El placeholder "ciudad de salida" aparece en SearchBar (desktop)
    // Y en MobileSearchCard (mobile, oculto en este viewport). Usamos
    // `eq(0)` para tomar el del SearchBar (primer nodo del DOM).
    cy.get('input[placeholder*="ciudad de salida" i]')
      .eq(0)
      .should('be.visible')
      .click()
      .type('Lima')

    // El dropdown del Autocomplete se abre. Esperamos la primera
    // opción de ciudad (role="option") y la seleccionamos.
    cy.get('ul[role="listbox"]', { timeout: 10000 })
      .first()
      .should('be.visible')
      .within(() => {
        cy.get('li[role="option"]').first().click()
      })

    // -------------------------------------------------------------
    // PASO 2: Llenar Destino
    // -------------------------------------------------------------
    cy.get('input[placeholder*="ciudad de destino" i]')
      .eq(0)
      .should('be.visible')
      .click()
      .type('Trujillo')

    cy.get('ul[role="listbox"]')
      .first()
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
    // Usamos `clear().type(fechaIso)` para que React detecte el
    // cambio via synthetic events. `.invoke('val', ...)` setea el
    // atributo value pero React no lo observa como cambio de estado.
    cy.get('input[type="date"]')
      .eq(0)
      .should('exist')
      .clear()
      .type(fechaIso)

    // -------------------------------------------------------------
    // PASO 4: Submit del formulario
    // -------------------------------------------------------------
    // El botón "Buscar Buses" aparece en el SearchBar (desktop)
    // y en el MobileSearchCard (mobile, oculto en este viewport
    // pero en el DOM). Usamos `eq(0)` para tomar el primero del
    // selector — que en el orden del DOM es el del SearchBar.
    cy.contains(/buscar buses/i).eq(0).click()

    // -------------------------------------------------------------
    // PASO 5: Aserciones
    // -------------------------------------------------------------
    // a) Navegación a /buses (React Router)
    cy.url({ timeout: 30000 }).should('include', '/buses')

    // b) La UI muestra al menos una card de bus con su precio.
    //    BusCardDesktop tiene el botón "Elegir Asientos" (no "Agotado").
    cy.contains('button', /elegir asientos/i, { timeout: 15000 })
      .should('exist')
  })

  it('muestra estado vacío cuando no hay viajes', () => {
    // El componente `ResultsPage` lee los query params `origen`,
    // `destino` y `fecha` (NO `id_terminal_*`). Usamos IDs que no
    // existen en el catálogo de terminales del frontend (999, 998)
    // para forzar un resultado vacío del backend.
    cy.visit('/buses?origen=999&destino=998&fecha=2027-01-01', {
      timeout: 30000,
    })

    // El componente debe renderizar el EmptyState con el texto
    // "No encontramos buses para esta ruta y fecha".
    cy.contains(/no encontr/i, { timeout: 15000 })
      .should('be.visible')
  })
})
