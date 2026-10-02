/**
 * fitness.mjs — Fitness (LOGICA §11): los puros y una medida de ida y vuelta.
 *   · `aSegundos` / `deSegundos` / `valorDeTexto` / `textoDeValor` / `progreso`;
 *   · con login real, una medida en una fecha de 1970: se escribe, se corrige, se relee y
 *     se borra. No toca ninguna medida de Alex.
 * `node tests/fitness.mjs`.
 */
import assert from 'node:assert/strict'
import { entrar, paso, ok, ko, cerrar } from './_comun.mjs'
import * as fit from '../src/datos/fitness.js'

console.log('fitness.mjs — sesiones y medidas\n')

/* ── 1 · puros ──────────────────────────────────────────────────────────────── */
try {
  assert.equal(fit.aSegundos('12:30'), 750)
  assert.equal(fit.aSegundos('1:02:30'), 3750)
  assert.equal(fit.aSegundos('45'), 45, 'sin dos puntos son segundos')
  assert.equal(fit.aSegundos(''), null)
  assert.ok(Number.isNaN(fit.aSegundos('doce')), 'lo que no es un tiempo es NaN')
  assert.ok(Number.isNaN(fit.aSegundos('12:')), 'un tiempo a medias es NaN')
  assert.equal(fit.deSegundos(750), '12:30')
  assert.equal(fit.deSegundos(45), '0:45')
  assert.equal(fit.deSegundos(3750), '1:02:30')
  ok('tiempos: mm:ss ↔ segundos')
} catch (e) { ko('tiempos', e) }

try {
  const kg = { clave: 'sentadilla_5rm', formato: 'numero' }
  const t = { clave: 'plancha', formato: 'tiempo' }
  assert.equal(fit.valorDeTexto(kg, '82,5'), 82.5, 'coma decimal')
  assert.equal(fit.valorDeTexto(kg, ' 100 '), 100)
  assert.equal(fit.valorDeTexto(kg, ''), null)
  assert.ok(Number.isNaN(fit.valorDeTexto(kg, '100kg')))
  assert.equal(fit.valorDeTexto(t, '2:05'), 125)
  assert.equal(fit.textoDeValor(kg, 82.5), '82,5')
  assert.equal(fit.textoDeValor(t, 125), '2:05')
  assert.equal(fit.textoDeValor(kg, null), '')
  ok('campos: texto ↔ valor según el formato de la prueba')
} catch (e) { ko('campos', e) }

try {
  const sesion = { fecha: '2026-10-05', pruebas: [{ clave: 'a' }, { clave: 'b' }, { clave: 'c', opcional: true }] }
  const medidas = [{ fecha: '2026-10-05', clave: 'a', valor: 1 }, { fecha: '2026-10-06', clave: 'b', valor: 2 }]
  assert.deepEqual(fit.medidasDe(medidas, '2026-10-05'), { a: 1 })
  assert.deepEqual(fit.progreso(sesion, medidas), { hechas: 1, total: 2 }, 'la opcional sin poner no cuenta')
  assert.deepEqual(fit.progreso(sesion, [...medidas, { fecha: '2026-10-05', clave: 'c', valor: 3 }]), { hechas: 2, total: 3 }, 'la opcional puesta sí')
  assert.equal(fit.sesionDe([sesion], '2026-10-05'), sesion)
  assert.equal(fit.sesionDe([sesion], '2026-10-06'), null)
  ok('progreso: «1/2», las opcionales sólo cuentan si se ponen')
} catch (e) { ko('progreso', e) }

/* ── 2 · la base, con login real ────────────────────────────────────────────── */
try {
  await entrar()
  ok('login con la cuenta del vault')
} catch (e) { ko('login', e); cerrar('fitness.mjs') }

const FECHA = '1970-01-01'
const CLAVE = 'prueba_core'
try {
  const sesiones = await fit.cargarSesiones()
  paso('hay sesiones y cada una trae líneas y pruebas', sesiones.length > 0 && sesiones.every((s) => s.titulo && Array.isArray(s.lineas) && Array.isArray(s.pruebas)))
  paso('las claves de las pruebas no se repiten dentro de una sesión', sesiones.every((s) => new Set(s.pruebas.map((p) => p.clave)).size === s.pruebas.length))

  const antes = (await fit.cargarMedidas()).length
  const m = await fit.medir(FECHA, CLAVE, 82.5)
  paso('medir() escribe y devuelve la medida', m?.valor === 82.5 && m.fecha === FECHA && m.clave === CLAVE)
  const m2 = await fit.medir(FECHA, CLAVE, 85)
  paso('medir() dos veces corrige, no duplica', m2?.valor === 85 && (await fit.cargarMedidas()).filter((x) => x.fecha === FECHA && x.clave === CLAVE).length === 1)
  await fit.medir(FECHA, CLAVE, null)
  const despues = await fit.cargarMedidas()
  paso('medir(null) borra y deja las medidas como estaban', despues.length === antes && !despues.some((x) => x.fecha === FECHA))
} catch (e) {
  ko('la base', e)
  try { await fit.medir(FECHA, CLAVE, null) } catch { /* ya se avisó arriba */ }
}

cerrar('fitness.mjs')
