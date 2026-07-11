// ============================================================================
// Hook global de Cypress: se carga antes de cada archivo de specs.
// Aquí se puede:
//   - Importar commands custom (cy.login, cy.buscarViaje, etc.)
//   - Silenciar errores esperados de la app (ej. ResizeObserver en React 19)
//   - Inyectar listeners globales (cy.on('uncaught:exception'))
// ============================================================================

import './commands'

// En dev mode, React lanza advertencias de hidratación que NO son
// errores reales. Las ignoramos para evitar que fallen specs que
// solo verifican renderizado.
Cypress.on('uncaught:exception', (err) => {
  if (
    /hydrat/i.test(err.message) ||
    /ResizeObserver loop/.test(err.message)
  ) {
    return false
  }
  return true
})

// Limpia localStorage / sessionStorage antes de cada test para
// evitar contaminación entre specs.
beforeEach(() => {
  cy.clearLocalStorage()
  cy.clearCookies()
  // sessionStorage NO se puede limpiar desde cy.* sin un visit,
  // por lo que cada spec debe limpiarlo tras un cy.visit('/') si lo usa.
})
