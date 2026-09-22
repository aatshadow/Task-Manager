/**
 * protocolo.mjs — las funciones PURAS del Protocolo (LOGICA §10), sin red.
 *   · bloque actual / siguiente / minutos restantes, con el de Sueño cruzando medianoche;
 *   · el sábado no hay dailies; · el día del reto antes, dentro y después;
 *   · adherencia con `evitar` y `medir`; días perfectos y su racha; agrupar por bloque;
 *   · el mapa de calor: 90 celdas, futuro hueco, cerrados desde `hoy_dias`.
 * Sin framework: assert + console. `node tests/protocolo.mjs`.
 */
import assert from 'node:assert/strict'
import { paso, ok, ko, cerrar } from './_comun.mjs'
import * as bloques from '../src/datos/bloques.js'
import * as retos from '../src/datos/retos.js'
import * as hitos from '../src/datos/hitos.js'
import * as habitos from '../src/datos/habitos.js'
import * as stats from '../src/datos/estadisticas.js'

console.log('protocolo.mjs — el Protocolo, en puro\n')

const B = (id, nombre, inicio, fin, dias, posicion, fase = 'ofensiva') => ({ id, nombre, inicio, fin, dias, posicion, fase, activo: true, archivadoEn: null })
const RAIL = [
  B('act', 'Activación del Emperador', '04:30', '04:45', [1, 2, 3, 4, 5, 6, 7], 0, 'calibracion'),
  B('med', 'Meditación', '04:45', '05:30', [1, 2, 3, 4, 5, 6, 7], 1, 'calibracion'),
  B('c1', 'Comida 1', '05:30', '06:15', [1, 2, 3, 4, 5, 6, 7], 2, 'nutricion'),
  B('gym', 'Entrenamiento', '06:40', '07:30', [1, 2, 4, 5], 4, 'cuerpo'),
  B('inm', 'Inmersión total', '08:00', '11:00', [1, 2, 3, 4, 5], 7),
  B('socio', 'Daily con el Socio', '13:00', '14:00', [1, 2, 3, 4, 5], 11, 'reuniones'),
  B('spa', 'Spa', '18:30', '19:30', [1, 2, 3, 4, 5, 6, 7], 18, 'cuerpo'),
  B('plan', 'Planificación del mañana', '19:30', '20:00', [1, 2, 3, 4, 5, 6, 7], 19, 'consolidacion'),
  B('off', 'Desconexión total', '20:00', '22:00', [1, 2, 3, 4, 5, 6, 7], 20, 'apagado'),
  B('sueno', 'Sueño', '22:00', '04:30', [1, 2, 3, 4, 5, 6, 7], 21, 'apagado'),
]
const MARTES = '2026-09-22'
const SABADO = '2026-09-26'

/* ── 1 · bloques ───────────────────────────────────────────────────────────── */
try {
  assert.equal(bloques.bloqueActual(RAIL, MARTES, '03:00')?.id, 'sueno', 'a las 03:00 es Sueño (empezó ayer)')
  assert.equal(bloques.bloqueActual(RAIL, MARTES, '23:30')?.id, 'sueno', 'a las 23:30 es Sueño (empezó hoy)')
  assert.equal(bloques.bloqueActual(RAIL, MARTES, '04:31')?.id, 'act', 'a las 04:31 es Activación')
  assert.equal(bloques.bloqueActual(RAIL, MARTES, '04:30')?.id, 'act', 'a las 04:30 en punto ya es Activación, no Sueño')
  assert.equal(bloques.bloqueActual(RAIL, MARTES, '08:30')?.id, 'inm', 'a las 08:30 es Inmersión')
  assert.equal(bloques.bloqueActual(RAIL, MARTES, '23:59')?.id, 'sueno', 'a las 23:59 es Sueño')
  assert.equal(bloques.bloqueActual(RAIL, MARTES, '07:45'), null, 'a las 07:45 (hueco del raíl de prueba) no hay bloque')
  assert.equal(bloques.bloqueActual(RAIL, SABADO, '08:30'), null, 'el sábado no hay Inmersión')
  assert.equal(bloques.bloqueActual(RAIL, SABADO, '13:30'), null, 'el sábado no hay daily')
  assert.equal(bloques.bloqueActual(RAIL, '2026-09-23', '07:00'), null, 'el miércoles no hay gym')
  assert.equal(bloques.bloqueActual(RAIL, MARTES, '07:00')?.id, 'gym', 'el martes sí')
  assert.deepEqual(bloques.bloquesDelDia(RAIL, SABADO).map((b) => b.id), ['act', 'med', 'c1', 'spa', 'plan', 'off', 'sueno'], 'el sábado: calibración, comida, spa, planificación y apagado')
  assert.equal(bloques.siguienteBloque(RAIL, MARTES, '08:30')?.bloque.id, 'socio', 'después de Inmersión viene el daily')
  const s = bloques.siguienteBloque(RAIL, MARTES, '23:00')
  assert.equal(s?.bloque.id, 'act', 'a las 23:00 el siguiente es la Activación…')
  assert.equal(s?.fecha, '2026-09-23', '…de mañana')
  assert.equal(bloques.minutosRestantes(RAIL[4], '08:30'), 150, 'de Inmersión quedan 2h30 a las 08:30')
  assert.equal(bloques.minutosRestantes(RAIL[9], '23:30'), 300, 'de Sueño quedan 5 h a las 23:30')
  assert.equal(bloques.minutosRestantes(RAIL[9], '03:00'), 90, 'de Sueño quedan 90 min a las 03:00')
  assert.equal(bloques.minutosRestantes(RAIL[4], '11:00'), 0, 'a las 11:00 Inmersión ya acabó')
  assert.equal(bloques.duracion(RAIL[9]), 390, 'Sueño dura 6h30')
  assert.equal(bloques.textoMinutos(72), '1h 12m')
  assert.equal(bloques.textoMinutos(45), '45m')
  assert.equal(bloques.textoMinutos(120), '2h')
  const inactivo = { ...RAIL[4], activo: false }
  assert.equal(bloques.bloqueActual([inactivo], MARTES, '08:30'), null, 'un bloque desactivado no cuenta')
  ok('bloques: actual (Sueño cruza medianoche), siguiente (mañana), restantes, sábado sin trabajo')
} catch (e) { ko('bloques', e) }

/* ── 2 · el reto ───────────────────────────────────────────────────────────── */
try {
  const R = { id: 'r', nombre: 'Zero Agent Challenge', inicio: '2026-09-23', fin: '2026-12-21', activo: true }
  assert.equal(retos.totalDias(R), 90, '23-09 → 21-12 son 90 días')
  assert.deepEqual(retos.diaDelReto(R, '2026-09-22'), { dia: 0, total: 90, antes: true, terminado: false, faltan: 1 }, 'el 22 aún no: falta 1 día')
  assert.deepEqual(retos.diaDelReto(R, '2026-09-23'), { dia: 1, total: 90, antes: false, terminado: false, faltan: 0 }, 'el 23 es el día 1')
  assert.equal(retos.diaDelReto(R, '2026-12-21').dia, 90, 'el 21-12 es el día 90')
  assert.equal(retos.diaDelReto(R, '2026-12-21').terminado, false, 'el día 90 aún no está terminado')
  assert.deepEqual(retos.diaDelReto(R, '2026-12-22'), { dia: 90, total: 90, antes: false, terminado: true, faltan: 0 }, 'el 22-12 está terminado')
  assert.equal(retos.fechasDelReto(R).length, 90)
  assert.equal(retos.fechasDelReto(R)[0], '2026-09-23')
  assert.equal(retos.fechasDelReto(R).at(-1), '2026-12-21')
  assert.equal(retos.diaDelReto(null, '2026-09-23').total, 0, 'sin reto, nada')
  const viejo = { ...R, id: 'v', nombre: 'Viejo', inicio: '2026-01-01', fin: '2026-03-31' }
  assert.equal(retos.retoVigente([viejo, R], '2026-09-22')?.id, 'r', 'antes de empezar manda el próximo, no el viejo')
  assert.equal(retos.retoVigente([viejo, R], '2026-10-10')?.id, 'r', 'dentro manda el que contiene la fecha')
  assert.equal(retos.retoVigente([viejo, R], '2027-01-10')?.id, 'r', 'después manda el último')
  assert.equal(retos.retoVigente([{ ...R, activo: false }], '2026-10-10'), null, 'uno inactivo no manda')
  ok('reto: 90 días, antes / día 1 / día 90 / terminado, vigente')
} catch (e) { ko('reto', e) }

/* ── 3 · hitos ─────────────────────────────────────────────────────────────── */
try {
  const H = (nombre, fecha, hecho = false, posicion = 0) => ({ id: nombre, nombre, frente: nombre, fecha, hecho, posicion })
  assert.equal(hitos.diasHasta(H('Chan', '2026-09-25'), MARTES), 3)
  assert.equal(hitos.textoHito(H('Chan', '2026-09-25'), MARTES), 'en 3 días')
  assert.equal(hitos.textoHito(H('x', MARTES), MARTES), 'hoy')
  assert.equal(hitos.textoHito(H('x', '2026-09-23'), MARTES), 'mañana')
  assert.equal(hitos.textoHito(H('x', '2026-09-20'), MARTES), 'hace 2 días')
  assert.equal(hitos.textoHito(H('x', null), MARTES), 'sin fecha')
  assert.equal(hitos.urgente(H('Chan', '2026-09-25'), MARTES), true, '≤ 3 días es urgente')
  assert.equal(hitos.urgente(H('Elena', '2026-09-29'), MARTES), false)
  assert.equal(hitos.urgente(H('Chan', '2026-09-25', true), MARTES), false, 'hecho no es urgente')
  const orden = hitos.ordenarHitos([H('Gemelos', null, false, 3), H('Elena', '2026-09-29'), H('Chan', '2026-09-25'), H('Viejo', '2026-09-01', true)], MARTES)
  assert.deepEqual(orden.map((h) => h.nombre), ['Chan', 'Elena', 'Gemelos', 'Viejo'], 'con fecha primero, sin fecha después, hechos al final')
  ok('hitos: días hasta, texto, urgencia y orden')
} catch (e) { ko('hitos', e) }

/* ── 4 · adherencia, perfectos, plan, grupos ──────────────────────────────── */
try {
  const HAB = (id, tipo, extra = {}) => ({ id, nombre: id, tipo, cadencia: 'diario', dias: [], hora: '08:00', bloqueId: null, creadoEn: '2026-09-01T00:00:00Z', archivadoEn: null, ...extra })
  const hacer = HAB('hacer', 'hacer', { hora: '04:30', bloqueId: 'act' })
  const evitar = HAB('evitar', 'evitar', { hora: '16:00' })
  const medir = HAB('medir', 'medir', { unidad: 'kg', hora: '04:40', bloqueId: 'act' })
  const gym = HAB('gym', 'hacer', { cadencia: 'dias', dias: [1, 2, 4, 5], hora: '06:40', bloqueId: 'gym' })
  const semana = HAB('sem', 'hacer', { cadencia: 'semana', vecesSemana: 3 })
  const todos = [hacer, evitar, medir, gym, semana]
  const M = (habitoId, fecha, valor = null) => ({ habitoId, fecha, nota: '', valor })

  // martes: tocan hacer, evitar, medir, gym (el `semana` sólo si se marca)
  let a = habitos.adherencia(todos, [], MARTES)
  assert.deepEqual(a, { tocaban: 4, hechos: 0, porcentaje: 0 }, 'martes sin marcas: 4 tocaban, 0 hechos; el semana no penaliza')
  a = habitos.adherencia(todos, [M('hacer', MARTES), M('evitar', MARTES)], MARTES)
  assert.deepEqual(a, { tocaban: 4, hechos: 2, porcentaje: 50 }, 'evitar cuenta igual que hacer')
  a = habitos.adherencia(todos, [M('medir', MARTES)], MARTES)
  assert.equal(a.hechos, 0, 'un medir sin valor NO está hecho')
  a = habitos.adherencia(todos, [M('medir', MARTES, 81.4)], MARTES)
  assert.equal(a.hechos, 1, 'un medir con valor sí')
  a = habitos.adherencia(todos, [M('sem', MARTES)], MARTES)
  assert.deepEqual(a, { tocaban: 5, hechos: 1, porcentaje: 20 }, 'el semana marcado suma a los dos lados')
  // miércoles: gym no toca → 3
  assert.equal(habitos.adherencia(todos, [], '2026-09-23').tocaban, 3, 'el miércoles el gym no toca')
  // un hábito nacido después de la fecha no cuenta
  const nuevo = HAB('nuevo', 'hacer', { creadoEn: '2026-09-25T10:00:00Z' })
  assert.equal(habitos.adherencia([nuevo], [], MARTES).tocaban, 0, 'nacido el 25 no toca el 22')
  const archivado = HAB('arch', 'hacer', { archivadoEn: '2026-09-20T10:00:00Z' })
  assert.equal(habitos.adherencia([archivado], [], MARTES).tocaban, 0, 'archivado el 20 no toca el 22')
  assert.equal(habitos.estaHecho(medir, [M('medir', MARTES, 0)], MARTES), true, 'valor 0 es un valor')

  // días perfectos y racha (hoy sin cerrar no rompe)
  const dos = [hacer, evitar]
  const marcas = [M('hacer', '2026-09-20'), M('evitar', '2026-09-20'), M('hacer', '2026-09-21'), M('evitar', '2026-09-21')]
  assert.equal(habitos.diaPerfecto(dos, marcas, '2026-09-21'), true)
  assert.equal(habitos.diaPerfecto(dos, marcas, MARTES), false)
  assert.equal(habitos.rachaPerfectos(dos, marcas, MARTES), 2, 'hoy sin cerrar no rompe: 20 y 21 → 2')
  assert.equal(habitos.rachaPerfectos(dos, [...marcas, M('hacer', MARTES), M('evitar', MARTES)], MARTES), 3, 'hoy perfecto suma')
  assert.equal(habitos.rachaPerfectos(dos, marcas, MARTES, '2026-09-21'), 1, 'no baja del inicio del reto')
  assert.equal(habitos.rachaPerfectos(dos, [M('hacer', '2026-09-21')], MARTES), 0, 'el 21 a medias rompe')
  assert.equal(habitos.nivelAdherencia({ tocaban: 4, hechos: 4 }), 4)
  assert.equal(habitos.nivelAdherencia({ tocaban: 4, hechos: 3 }), 3)
  assert.equal(habitos.nivelAdherencia({ tocaban: 4, hechos: 2 }), 2)
  assert.equal(habitos.nivelAdherencia({ tocaban: 4, hechos: 1 }), 1)
  assert.equal(habitos.nivelAdherencia({ tocaban: 0, hechos: 0 }), 0)

  // plan de hoy
  const entreno = HAB('entreno', 'hacer', { plan: { 1: { titulo: 'Leopardo', lineas: ['saco', 'burpees'] }, 5: { titulo: 'León', lineas: [] } } })
  assert.deepEqual(habitos.planDeHoy(entreno, '2026-09-21'), { titulo: 'Leopardo', lineas: ['saco', 'burpees'] }, 'lunes = Leopardo')
  assert.equal(habitos.planDeHoy(entreno, '2026-09-23'), null, 'miércoles sin plan')
  assert.equal(habitos.planDeHoy(entreno, '2026-09-25')?.titulo, 'León')

  // agrupar por bloque (martes): act → [hacer, medir], gym → [gym]; evitar y semana sueltos
  const grupos = habitos.agruparPorBloque(todos, RAIL, MARTES)
  assert.deepEqual(grupos.map((g) => g.bloque?.id ?? null), ['act', 'gym', null], 'en el orden del raíl, sueltos al final')
  assert.deepEqual(grupos[0].habitos.map((h) => h.id), ['hacer', 'medir'], 'dentro del bloque, por hora')
  assert.deepEqual(grupos[2].habitos.map((h) => h.id), ['sem', 'evitar'], 'sueltos también por hora (08:00 antes que 16:00)')
  const sab = habitos.agruparPorBloque(todos, RAIL, SABADO)
  assert.equal(sab.some((g) => g.bloque?.id === 'gym'), false, 'el sábado el gym no aparece')

  // serie de un medir
  const serie = habitos.serieMedida(medir, [M('medir', '2026-09-20', 82), M('medir', '2026-09-22', 81.4), M('medir', '2026-09-21')], '2026-09-19', '2026-09-23')
  assert.deepEqual(serie, [{ fecha: '2026-09-20', valor: 82 }, { fecha: '2026-09-22', valor: 81.4 }], 'sólo los días con valor')
  ok('adherencia (evitar = hacer, medir con valor, semana sólo marcado), perfectos, racha, plan, grupos, serie')
} catch (e) { ko('adherencia', e) }

/* ── 5 · mapa de calor del reto ───────────────────────────────────────────── */
try {
  const R = { id: 'r', nombre: 'Z', inicio: '2026-09-23', fin: '2026-12-21', activo: true }
  const h1 = { id: 'a', nombre: 'a', tipo: 'hacer', cadencia: 'diario', dias: [], creadoEn: '2026-09-01T00:00:00Z' }
  const h2 = { id: 'b', nombre: 'b', tipo: 'hacer', cadencia: 'diario', dias: [], creadoEn: '2026-09-01T00:00:00Z' }
  const marcas = [{ habitoId: 'a', fecha: '2026-09-23' }, { habitoId: 'b', fecha: '2026-09-23' }, { habitoId: 'a', fecha: '2026-09-25' }]
  const dias = [{ fecha: '2026-09-24', habitosTocaban: 2, habitosHechos: 1 }]
  const mapa = stats.mapaCalorReto([h1, h2], marcas, R, { dias, hoy: '2026-09-25' })
  assert.equal(mapa.length, 90, '90 celdas')
  assert.deepEqual(mapa[0], { fecha: '2026-09-23', tocaban: 2, hechos: 2, nivel: 4, futuro: false, hoy: false }, 'día 1 perfecto en vivo')
  assert.deepEqual(mapa[1], { fecha: '2026-09-24', tocaban: 2, hechos: 1, nivel: 2, futuro: false, hoy: false }, 'día 2 desde hoy_dias')
  assert.equal(mapa[2].hoy, true)
  assert.equal(mapa[2].nivel, 2, 'hoy a medias (1/2)')
  assert.equal(mapa[3].futuro, true)
  assert.equal(mapa[3].nivel, 0)
  assert.equal(mapa.filter((c) => c.futuro).length, 87)
  const porA = stats.mapaCalorReto([h1, h2], marcas, R, { dias, hoy: '2026-09-25', habito: h1 })
  assert.equal(porA[1].hechos, 0, 'por hábito ignora hoy_dias y calcula en vivo: a no se marcó el 24')
  assert.equal(porA[2].nivel, 4, 'a se marcó el 25')
  const r = stats.resumenReto(mapa)
  assert.equal(r.diasPasados, 3)
  assert.equal(r.perfectos, 1)
  assert.equal(r.media, 67, '(100 + 50 + 50) / 3')
  assert.equal(r.mejorSemana?.lunes, '2026-09-21')
  assert.equal(stats.mapaCalorReto([], [], null).length, 0, 'sin reto, sin mapa')
  ok('mapa de calor: 90 celdas, cerrados desde hoy_dias, hoy en vivo, futuro hueco, por hábito, resumen')
} catch (e) { ko('mapa de calor', e) }

cerrar('protocolo.mjs')
