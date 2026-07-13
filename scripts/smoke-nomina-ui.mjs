/**
 * Verifica que NominaForm monta sin errores (pantalla en blanco / crash).
 * Requiere: npm run dev en otra terminal.
 * Uso: node scripts/smoke-nomina-ui.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.SMOKE_URL || 'http://localhost:5174'
const URL = `${BASE}/nomina-smoke.html`

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
const pageErrors = []

page.on('pageerror', (err) => pageErrors.push(err.message))
page.on('console', (msg) => {
  if (msg.type() === 'error') pageErrors.push(msg.text())
})

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForSelector('#nomina-smoke-root', { timeout: 15000 })
  await page.waitForSelector('text=Personal', { timeout: 10000 })

  const rootText = await page.locator('#nomina-smoke-root').innerText()
  if (!rootText.trim()) {
    throw new Error('NominaForm montó pero el contenido está vacío')
  }

  if (pageErrors.some((e) => /useCallback is not defined|ReferenceError/i.test(e))) {
    throw new Error(`Error de runtime detectado: ${pageErrors.join(' | ')}`)
  }

  console.log('✅ Smoke Nómina OK — formulario visible, sin crash')
  process.exit(0)
} catch (err) {
  console.error('❌ Smoke Nómina falló:', err.message)
  if (pageErrors.length) console.error('Errores de consola:', pageErrors.join('\n'))
  process.exit(1)
} finally {
  await browser.close()
}
