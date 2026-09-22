/**
 * captura.mjs — fotos de la app con Chrome headless (Playwright), con login real.
 *   node tests/captura.mjs [--ancho 390|1440] [--alto 844] [--pestana hoy|tareas|calendario|habitos|estadisticas|ajustes]
 *                          [--base http://localhost:5400] [--salida capturas] [--pagina] [--hash '#...']
 * Usa el Playwright instalado en aula-core (no se añade dependencia a 2day). La
 * sesión es la cuenta del vault (`~/.core-secrets/hoy-test.env`), nunca en el repo.
 * `--pagina` captura la página entera (scroll incluido); sin él, sólo el viewport.
 */
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { leerEnv } from './_comun.mjs'

const require = createRequire(join(homedir(), 'CORE/aula-core/package.json'))
const { chromium } = require('playwright')

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d }
const flag = (n) => process.argv.includes(`--${n}`)
const ANCHO = Number(arg('ancho', 390))
const ALTO = Number(arg('alto', ANCHO >= 1024 ? 900 : 844))
const PESTANA = arg('pestana', 'hoy')
const BASE = arg('base', 'http://localhost:5400')
const SALIDA = arg('salida', 'capturas')
const HASH = arg('hash', '')
const secretos = leerEnv(join(homedir(), '.core-secrets', 'hoy-test.env'))
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

mkdirSync(SALIDA, { recursive: true })
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: 2, locale: 'es-ES', timezoneId: 'Europe/Sofia' })
const pag = await ctx.newPage()
pag.on('pageerror', (e) => console.log('  ✗ error en página:', e.message))
if (flag('traza')) {
  const t0 = Date.now(); const ts = () => ((Date.now() - t0) / 1000).toFixed(1)
  pag.on('request', (r) => { if (r.url().includes('supabase.co')) console.log(ts(), '→', r.url().replace(/^https:\/\/[^/]+/, '').slice(0, 70)) })
  pag.on('response', (r) => { if (r.url().includes('supabase.co')) console.log(ts(), '←', r.status(), r.url().replace(/^https:\/\/[^/]+/, '').slice(0, 70)) })
  pag.on('requestfailed', (r) => console.log(ts(), '✗', r.url().slice(0, 90), r.failure()?.errorText))
}
pag.on('console', (m) => { if (m.type() === 'error') console.log('  ✗ consola:', m.text().slice(0, 200)) })
await pag.goto(`${BASE}/${HASH}`, { waitUntil: 'domcontentloaded' })
await espera(1200)
if (await pag.$('input[type="email"]')) {
  await pag.fill('input[type="email"]', secretos.HOY_TEST_EMAIL)
  await pag.fill('input[type="password"]', secretos.HOY_TEST_PASSWORD)
  await pag.click('button[type="submit"]')
}
// Hasta que esté la app ENTERA y ASENTADA. Dos trampas medidas el 22-09:
//   · la pantalla de login ya tiene texto y no dice «Cargando», así que mirar sólo el
//     texto daba por buena la foto nada más pulsar Entrar;
//   · entre renders hay instantes sueltos sin «Cargando» aunque siga cargando.
// Por eso: armazón montado (la nav de 5) + DOS lecturas limpias seguidas.
let limpias = 0
for (let i = 0; i < 100; i += 1) {
  const listo = await pag.evaluate(() => !!document.querySelector('nav[aria-label="Principal"]') && !(document.body.innerText || '').includes('Cargando')).catch(() => false)
  limpias = listo ? limpias + 1 : 0
  if (limpias >= 2) break
  await espera(400)
  if (i === 99) console.log('  ! seguía cargando a los 40 s')
}
await espera(Number(arg('espera', 1200)))
if (PESTANA !== 'hoy') {
  const etiquetas = { tareas: 'Tareas', calendario: 'Calendario', habitos: 'Hábitos', estadisticas: 'Stats' }
  if (PESTANA === 'ajustes') await pag.click('[aria-label="Ajustes"]')
  else await pag.click(`nav[aria-label="Principal"] >> text=${etiquetas[PESTANA]}`)
  await espera(1500)
}
const sub = arg('sub', '')
if (sub) { await pag.click(`text=${sub}`); await espera(1200) }
const ruta = `${SALIDA}/${PESTANA}${sub ? '-' + sub.toLowerCase() : ''}-${ANCHO}.png`
await pag.screenshot({ path: ruta, fullPage: flag('pagina') })
console.log(`  ✓ ${ruta}`)
await browser.close()
