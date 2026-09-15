/**
 * forma.mjs — ¿está la base con la forma que 2day espera? (LOGICA §8)
 *   · la vista `hoy_todas` responde con login;
 *   · `hoy_sembrar()` y `hoy_mi_ficha()` existen y no fallan;
 *   · el anon NO puede leer las `hoy_*` (revoke = el muro);
 *   · la capa de datos exporta lo que dice el contrato (§7);
 *   · las funciones puras (fechas, hábitos, estadísticas) hacen lo que dicen.
 * Sin framework: assert + console. `node tests/forma.mjs`.
 */
import assert from 'node:assert/strict'
import { entrar, clienteAnon, paso, ok, ko, cerrar } from './_comun.mjs'
import * as fechas from '../src/datos/fechas.js'
import * as catalogos from '../src/datos/catalogos.js'
import * as tareas from '../src/datos/tareas.js'
import * as habitos from '../src/datos/habitos.js'
import * as plantillas from '../src/datos/plantillas.js'
import * as stats from '../src/datos/estadisticas.js'

console.log('forma.mjs — la base y el contrato\n')

/* ── 1 · el contrato §7: que exista cada nombre ─────────────────────────────── */
const contrato = {
  fechas: ['hoyLocal', 'sumarDias', 'diasEntre', 'semanaDe', 'mesDe', 'aISO'],
  catalogos: ['cargarAjustes', 'guardarAjustes', 'sembrar', 'cargarProyectos', 'crearProyecto', 'actualizarProyecto', 'archivarProyecto',
    'cargarClientes', 'cargarEquipo', 'cargarCategorias', 'crearCategoria', 'actualizarCategoria', 'archivarCategoria',
    'cargarPipelines', 'crearPipeline', 'crearEtapa', 'actualizarEtapa', 'borrarEtapa', 'reordenarEtapas', 'cargarTablerosDeCliente'],
  tareas: ['cargarTodas', 'cargarExplorar', 'crear', 'actualizar', 'mover', 'completar', 'capa', 'planificarHoy', 'seguir', 'archivar', 'borrar',
    'reiniciarDia', 'cargarDias', 'cargarComentarios', 'comentar', 'esAtrasada', 'esNevera', 'esBandeja', 'ErrorHoy'],
  habitos: ['cargarHabitos', 'crearHabito', 'actualizarHabito', 'archivarHabito', 'cargarMarcas', 'marcar', 'tocaHoy', 'racha', 'cumplimientoSemana'],
  plantillas: ['cargarPlantillas', 'crearPlantilla', 'actualizarPlantilla', 'borrarPlantilla', 'guardarItems', 'instanciar'],
  estadisticas: ['seriesCreadasHechas', 'porProyecto', 'porCategoria', 'porCuadrante', 'rachaDias', 'sobrecarga'],
}
const modulos = { fechas, catalogos, tareas, habitos, plantillas, estadisticas: stats }
for (const [mod, nombres] of Object.entries(contrato)) {
  const faltan = nombres.filter((n) => typeof modulos[mod][n] !== 'function')
  paso(`${mod}.js exporta ${nombres.length} nombres del contrato`, !faltan.length, faltan.length && new Error(`faltan: ${faltan.join(', ')}`))
}

/* ── 2 · fechas: local, nunca UTC ───────────────────────────────────────────── */
try {
  assert.equal(fechas.aISO(new Date(2026, 8, 16, 1, 0)), '2026-09-16', 'aISO a la 01:00 local sigue siendo el día 16')
  assert.equal(fechas.hoyLocal('04:00', new Date(2026, 8, 16, 2, 0)), '2026-09-15', 'a las 02:00 con reinicio 04:00 es ayer')
  assert.equal(fechas.hoyLocal('04:00', new Date(2026, 8, 16, 4, 0)), '2026-09-16', 'a las 04:00 ya es hoy')
  assert.equal(fechas.sumarDias('2026-09-30', 1), '2026-10-01')
  assert.equal(fechas.diasEntre('2026-09-01', '2026-09-16'), 15)
  assert.deepEqual(fechas.semanaDe('2026-09-16'), ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'])
  const mes = fechas.mesDe('2026-09-16')
  assert.equal(mes.primero, '2026-09-01'); assert.equal(mes.ultimo, '2026-09-30'); assert.equal(mes.dias.length, 30)
  assert.equal(mes.semanas[0][0], '2026-08-31', 'la rejilla empieza en el lunes anterior')
  assert.equal(mes.semanas.at(-1).at(-1), '2026-10-04')
  assert.equal(fechas.nombreDia('2026-09-16'), 'miércoles')
  assert.equal(fechas.diaSemanaISO('2026-09-20'), 7, 'domingo = 7')
  ok('fechas: local, reinicio a las 04:00, semana lunes→domingo, rejilla del mes')
} catch (e) { ko('fechas', e) }

/* ── 3 · hábitos: cadencias y racha ─────────────────────────────────────────── */
try {
  const diario = { id: 'a', cadencia: 'diario' }
  const lmx = { id: 'b', cadencia: 'dias', dias: [1, 3, 5] }
  const tres = { id: 'c', cadencia: 'semana', vecesSemana: 3 }
  assert.equal(habitos.tocaHoy(diario, '2026-09-20'), true)
  assert.equal(habitos.tocaHoy(lmx, '2026-09-16'), true, 'miércoles toca')
  assert.equal(habitos.tocaHoy(lmx, '2026-09-17'), false, 'jueves no toca')
  assert.equal(habitos.tocaHoy(tres, '2026-09-17'), true, 'semana: siempre se puede marcar')
  const m = (id, ...f) => f.map((fecha) => ({ habitoId: id, fecha }))
  // diario: 14, 15 marcados, hoy 16 sin marcar → 2 (hoy no rompe)
  assert.equal(habitos.racha(diario, m('a', '2026-09-14', '2026-09-15'), '2026-09-16'), 2)
  assert.equal(habitos.racha(diario, m('a', '2026-09-14', '2026-09-16'), '2026-09-16'), 1, 'el hueco del 15 rompe')
  // L/X/V: lun 14 y mié 16 marcados; martes no cuenta → 2
  assert.equal(habitos.racha(lmx, m('b', '2026-09-14', '2026-09-16'), '2026-09-17'), 2)
  // semana ×3: semana pasada (7-13) con 3, esta con 1 → 1 (la actual no rompe)
  assert.equal(habitos.racha(tres, m('c', '2026-09-07', '2026-09-09', '2026-09-11', '2026-09-15'), '2026-09-16'), 1)
  assert.deepEqual(habitos.cumplimientoSemana(lmx, m('b', '2026-09-14', '2026-09-15'), '2026-09-16'), { hechas: 1, objetivo: 3 }, 'el martes no cuenta')
  assert.deepEqual(habitos.cumplimientoSemana(tres, m('c', '2026-09-14', '2026-09-15'), '2026-09-16'), { hechas: 2, objetivo: 3 })
  ok('hábitos: tocaHoy, racha (solo días que tocaban) y cumplimiento de la semana')
} catch (e) { ko('hábitos', e) }

/* ── 4 · estadísticas puras ─────────────────────────────────────────────────── */
try {
  const ts = [
    { creadaEn: '2026-09-14T10:00:00Z', hecha: true, hechaEn: '2026-09-15T09:00:00Z', proyectoId: 'p1', categoria: 'ia', cuadrante: 'q1' },
    { creadaEn: '2026-09-14T11:00:00Z', hecha: true, hechaEn: '2026-09-16T09:00:00Z', clientId: 'kiki', categoria: 'ia', cuadrante: 'q2' },
    { creadaEn: '2026-09-16T11:00:00Z', hecha: false, hechaEn: null, proyectoId: 'p1', categoria: null, cuadrante: null },
  ]
  const s = stats.seriesCreadasHechas(ts, '2026-09-13', '2026-09-16')
  assert.equal(s.length, 4, 'un punto por día, sin huecos')
  assert.deepEqual(s[1], { fecha: '2026-09-14', creadas: 2, hechas: 0 })
  assert.deepEqual(s[3], { fecha: '2026-09-16', creadas: 1, hechas: 1 })
  const h = stats.hechasEnRango(ts, '2026-09-15', '2026-09-16')
  assert.equal(h.length, 2)
  assert.deepEqual(stats.porProyecto(h, { proyectos: [{ id: 'p1', nombre: 'Uno' }], clientes: [{ id: 'kiki', nombre: 'Kiki' }] }).map((x) => x.nombre).sort(), ['Kiki', 'Uno'])
  assert.deepEqual(stats.porCategoria(h), [{ clave: 'ia', nombre: 'ia', n: 2 }])
  assert.equal(stats.porCuadrante(h, { q1: { nombre: 'Urgente' } })[0].n, 1)
  assert.equal(stats.rachaDias(ts, '2026-09-16'), 2)
  assert.deepEqual(stats.sobrecarga([{ fecha: '2026-09-15', planificadas: 7, hechas: 4 }, { fecha: '2026-09-14', planificadas: 3, hechas: 3 }])[0].fecha, '2026-09-14')
  ok('estadísticas: series sin huecos, agrupaciones, racha y sobrecarga')
} catch (e) { ko('estadísticas', e) }

/* ── 5 · la base, con login real ────────────────────────────────────────────── */
let sb
try {
  ;({ sb } = await entrar())
  ok('login con la cuenta del vault')
} catch (e) { ko('login', e); cerrar('forma.mjs') }

try {
  const { error } = await sb.rpc('hoy_sembrar')
  paso('hoy_sembrar() no falla', !error, error)
  const ficha = await sb.rpc('hoy_mi_ficha')
  paso('hoy_mi_ficha() devuelve mi ficha de equipo', !ficha.error && !!ficha.data, ficha.error)
  const vista = await sb.from('hoy_todas').select('id, origen, titulo, estado, cuadrante, seguida').limit(5)
  paso('la vista hoy_todas responde', !vista.error, vista.error)
  const cats = await catalogos.cargarCategorias()
  paso('sembradas las 7 categorías del portal', catalogos.CATEGORIAS_PORTAL.every((k) => cats.some((c) => c.clave === k)))
  const pipes = await catalogos.cargarPipelines()
  const principal = pipes.find((p) => p.esDefault)
  paso('pipeline Principal con las 5 etapas del vocabulario', principal && catalogos.ESTADOS.every((e) => principal.etapas.some((x) => x.clave === e.clave)))
  paso('la etapa done es terminal', principal?.etapas.find((e) => e.clave === 'done')?.esTerminal === true)
  const ajustes = await catalogos.cargarAjustes()
  paso('ajustes: hora de reinicio 04:00 y 4 cuadrantes', ajustes.horaReinicio === '04:00' && Object.keys(ajustes.cuadrantes).length === 4)
  const clientes = await catalogos.cargarClientes()
  paso('clientes de GrowthInfo (la RLS decide): kiki está', clientes.some((c) => c.id === 'kiki'))
  const tableros = await catalogos.cargarTablerosDeCliente('kiki')
  paso('kiki tiene tablero por defecto con etapa done', tableros.some((t) => t.esDefault && t.etapas.some((e) => e.clave === 'done')))
  const dias = await tareas.reiniciarDia('1970-01-01')
  paso('hoy_reiniciar_dia() existe (con una fecha del pasado no cierra nada)', Array.isArray(dias) && dias.length === 0)
  const pls = await plantillas.cargarPlantillas()
  paso('las plantillas de la agencia se listan en solo lectura', pls.some((p) => p.origen === 'agencia' && p.soloLectura))
} catch (e) { ko('la base', e) }

/* ── 6 · el muro: anon fuera ────────────────────────────────────────────────── */
try {
  const anon = clienteAnon()
  const r = await anon.from('hoy_tareas').select('id').limit(1)
  paso('anon no puede leer hoy_tareas (revoke)', !!r.error, !r.error && new Error('anon leyó la tabla'))
  const v = await anon.from('hoy_todas').select('id').limit(1)
  paso('anon no puede leer hoy_todas', !!v.error, !v.error && new Error('anon leyó la vista'))
  const f = await anon.rpc('hoy_sembrar')
  paso('anon no puede ejecutar hoy_sembrar()', !!f.error, !f.error && new Error('anon sembró'))
} catch (e) { ko('el muro', e) }

cerrar('forma.mjs')
