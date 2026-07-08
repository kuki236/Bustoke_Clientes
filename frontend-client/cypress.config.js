// ============================================================================
// Configuración de Cypress para el frontend de Bustoke.
//
// Las URLs base se leen de variables de entorno con fallback sensato:
//   - CYPRESS_BASE_URL : URL del frontend (default: localhost:5173)
//   - CYPRESS_API_URL  : URL del backend  (default: localhost:8000/v1)
//
// Para apuntar a staging (Render), exporta antes de correr cypress:
//   $env:CYPRESS_API_URL="https://bustoke-backend.onrender.com/v1"
//   npm run cy:open
//
// NOTA sobre cold starts de Render: el timeout por defecto de `cy.request`
// y `cy.visit` se sube a 30s y 60s respectivamente. Los selectores clave
// usan `{ timeout: 10000 }` para tolerar el primer hit a un endpoint en
// reposo (Render free tier duerme la instancia tras 15 min sin tráfico).
// ============================================================================

import { defineConfig } from 'cypress'

const FRONTEND_BASE = process.env.CYPRESS_BASE_URL || 'http://localhost:5173'
const API_BASE = process.env.CYPRESS_API_URL || 'http://localhost:8000/v1'

export default defineConfig({
  e2e: {
    baseUrl: FRONTEND_BASE,
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/e2e.js',
    fixturesFolder: 'cypress/fixtures',
    screenshotsFolder: 'cypress/screenshots',
    videosFolder: 'cypress/videos',
    downloadsFolder: 'cypress/downloads',

    // Viewport desktop por defecto (el flujo crítico es desktop-first).
    viewportWidth: 1366,
    viewportHeight: 768,

    // Timeouts ampliados para tolerar cold starts de Render free tier.
    defaultCommandTimeout: 10000,
    requestTimeout: 30000,
    responseTimeout: 30000,
    pageLoadTimeout: 60000,

    // Reintentos solo en CI (no localmente para fallar rápido).
    retries: {
      runMode: 2,
      openMode: 0,
    },

    // Hooks para preparar el entorno antes de la suite.
    setupNodeEvents(on, config) {
      // Expone la URL del API a los tests vía Cypress.env() para que
      // TODOS los `cy.request()` en commands.js la lean de un solo lugar.
      config.env.apiBaseUrl = API_BASE
      return config
    },
  },
})
