/**
 * Helpers de sanitización defensiva contra XSS (FIX A03 — OWASP).
 *
 * NOTA IMPORTANTE: la mejor defensa contra XSS es:
 *   1. Cookies httpOnly (no accesibles vía JS) — ver SECURITY.md § "Migración
 *      recomendada a httpOnly cookies".
 *   2. Content-Security-Policy estricta — ver backend/app/core/security_headers.py.
 *   3. Escapar SIEMPRE el texto del usuario al renderizar (este archivo).
 *
 * Estos helpers son la RED DE SEGURIDAD (defense in depth) para los
 * campos de texto libre que la app renderiza en el DOM:
 *   - motivo / detalle de un reclamo
 *   - nombres / apellidos del usuario
 *   - mensaje de chat en un reclamo
 *   - dirección / referencias del checkout
 *
 * En componentes React, la forma idiomática es:
 *   <p>{escapeHtml(claim.motivo)}</p>   ✅ seguro por defecto
 *   <p>{claim.motivo}</p>               ⚠️ React ya escapa, pero
 *                                         usar escapeHtml es defensa extra
 *   <p dangerouslySetInnerHTML={{__html: claim.motivo}} />  ❌ NUNCA
 */

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
}

/**
 * Escapa caracteres HTML peligrosos en una cadena.
 * @param {*} input - Cualquier valor (se convierte a string)
 * @returns {string} Cadena segura para insertar en el DOM como texto
 */
export function escapeHtml(input) {
  if (input === null || input === undefined) return ''
  return String(input).replace(/[&<>"'`=/]/g, (s) => HTML_ESCAPES[s])
}

/**
 * Sanitiza una URL para uso seguro en `href`/`src`.
 * Bloquea `javascript:`, `data:` y `vbscript:` (vectores clásicos de XSS).
 * @param {string} url
 * @returns {string} URL segura o '' si la original era maliciosa
 */
export function sanitizeUrl(url) {
  if (!url) return ''
  const cleaned = String(url).trim()
  if (/^(javascript|data|vbscript|file):/i.test(cleaned)) return ''
  return cleaned
}

/**
 * Trunca texto a un máximo de N caracteres, agregando "…" si se cortó.
 * Útil para prevenir UI overflow con inputs maliciosos largos.
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
export function truncate(text, max = 200) {
  const s = String(text || '')
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}
