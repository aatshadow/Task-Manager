/**
 * EOD (LOGICA §16), de ida y vuelta en la base real: escribe una respuesta y marca «Dientes
 * lavados» desde la pantalla, lo relee de Supabase y deja todo como estaba.
 * ⚠️ Corre con la cuenta REAL de Alex (hoy-test.env): sólo toca lo que pone y lo restaura.
 *   node tests/eod.mjs
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { leerEnv } from './_comun.mjs'

const require = createRequire(join(homedir(), 'CORE/aula-core/package.json'))
const { chromium } = require('playwright')
const s = leerEnv(join(homedir(), '.core-secrets', 'hoy-test.env'))
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const PRUEBA = `prueba EOD ${Date.now()}`

const browser = await chromium.launch()
const pag = await (await browser.newContext({ viewport: { width: 390, height: 1500 }, locale: 'es-ES', timezoneId: 'Europe/Sofia' })).newPage()
pag.on('pageerror', (e) => console.log('  ✗ error en página:', e.message))
await pag.goto('http://localhost:5400/', { waitUntil: 'domcontentloaded' })
await espera(1200)
if (await pag.$('input[type="email"]')) {
  await pag.fill('input[type="email"]', s.HOY_TEST_EMAIL)
  await pag.fill('input[type="password"]', s.HOY_TEST_PASSWORD)
  await pag.click('button[type="submit"]')
}
await pag.waitForSelector('nav[aria-label="Principal"]', { timeout: 40000 })
await pag.click('nav[aria-label="Principal"] >> text=EOD')
await pag.waitForSelector('.eod-pregunta textarea:not([disabled])')

// lo que hay antes, para restaurarlo
const sb = (q) => pag.evaluate(async (q) => {
  const { supabase } = await import('/src/lib/supabase.js')
  const hoy = document.querySelector('.eod-titulo') && (await import('/src/datos/fechas.js')).hoyLocal()
  if (q === 'eod') return (await supabase.from('hoy_eod').select('*').eq('fecha', hoy).maybeSingle()).data
  const h = (await supabase.from('hoy_habitos').select('id').eq('nombre', 'Dientes lavados').single()).data
  return (await supabase.from('hoy_marcas').select('*').eq('habito_id', h.id).eq('fecha', hoy).maybeSingle()).data
}, q)
const eodAntes = await sb('eod')
const dientesAntes = await sb('dientes')

const primera = pag.locator('.eod-pregunta textarea').first()
const textoAntes = await primera.inputValue()
await primera.fill(PRUEBA)
await pag.click('.eod-cabeza-textos')            // salir del campo = guardar
await pag.click('.eod-dientes')
await espera(2500)

const eod = await sb('eod')
const dientes = await sb('dientes')
const okRespuesta = Object.values(eod?.respuestas || {}).includes(PRUEBA)
const okDientes = !!dientes !== !!dientesAntes
console.log(okRespuesta ? '  ✓ respuesta guardada en hoy_eod' : '  ✗ la respuesta no llegó a hoy_eod')
console.log(okDientes ? '  ✓ «Dientes lavados» cambió en hoy_marcas' : '  ✗ la marca de dientes no cambió')

// restaurar
await primera.fill(textoAntes)
await pag.click('.eod-cabeza-textos')
await pag.click('.eod-dientes')
await espera(2500)
if (!eodAntes) {
  await pag.evaluate(async (f) => { const { supabase } = await import('/src/lib/supabase.js'); await supabase.from('hoy_eod').delete().eq('fecha', f) }, eod.fecha)
}
const dientesDespues = await sb('dientes')
console.log(!!dientesDespues === !!dientesAntes ? '  ✓ restaurado' : '  ✗ la marca de dientes no volvió a su estado')
await browser.close()
process.exit(okRespuesta && okDientes ? 0 : 1)
