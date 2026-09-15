/**
 * catalogos.js — ajustes, proyectos, clientes, equipo, categorías, pipelines y tableros.
 *
 * Todo devuelve objetos en el vocabulario de la pantalla (español, camelCase) y traduce a
 * columnas en UN sitio por tabla (`aXxx` / `aColumnasXxx`). Los errores explotan con
 * `ErrorHoy` (ver `lib/supabase.js`): un vacío sólo puede significar «no hay nada».
 */
import { supabase, isConfigured, ErrorHoy, filas, uno, ok } from '../lib/supabase.js'
import { horaCorta } from './fechas.js'

/* ── vocabulario fijo ──────────────────────────────────────────────────────────
   Las CLAVES viajan a la base (hay `check` que las validan). Cambiar una etiqueta no
   rompe nada; cambiar una clave sí, y por eso están en un solo sitio. */

/** El vocabulario común de estado: el mismo en `hoy_tareas.estado` y en `tasks.status`. */
export const ESTADOS = [
  { clave: 'todo', nombre: 'Por hacer', color: '#8a8f98' },
  { clave: 'in_progress', nombre: 'En curso', color: '#4c8dff' },
  { clave: 'review', nombre: 'En revisión', color: '#a56bff' },
  { clave: 'blocked', nombre: 'Bloqueado', color: '#f2545b' },
  { clave: 'done', nombre: 'Hecho', color: '#3fb950' },
]
export const esEstado = (k) => ESTADOS.some((e) => e.clave === k)

/** Las 7 categorías que admite `tasks.category`. Una tarea del portal no puede llevar otra. */
export const CATEGORIAS_PORTAL = ['proyecto', 'soporte', 'contenido', 'ventas', 'ia', 'afiliados', 'general']
export const categoriaPortal = (k) => (CATEGORIAS_PORTAL.includes(k) ? k : 'general')

export const CUADRANTES = ['q1', 'q2', 'q3', 'q4']
export const esCuadrante = (q) => CUADRANTES.includes(q)

/**
 * Cuadrante → prioridad del portal (decisión 5). Se traduce UNA vez, al crear en `tasks`;
 * después los dos ejes van separados. Sin cuadrante, la prioridad por defecto del portal.
 */
export const PRIORIDAD_DE_CUADRANTE = { q1: 'urgente', q2: 'alta', q3: 'media', q4: 'baja' }
export const prioridadDeCuadrante = (q) => PRIORIDAD_DE_CUADRANTE[q] || 'media'
/** La inversa, para leer una plantilla de la agencia como si tuviera cuadrantes. */
export const CUADRANTE_DE_PRIORIDAD = { urgente: 'q1', alta: 'q2', media: 'q3', baja: 'q4' }
export const cuadranteDePrioridad = (p) => CUADRANTE_DE_PRIORIDAD[p] || null

const listo = () => {
  if (!isConfigured || !supabase) throw new ErrorHoy('Supabase no está configurado')
}

/* ── AJUSTES ───────────────────────────────────────────────────────────────── */

const aAjustes = (a) => ({
  horaReinicio: horaCorta(a.hora_reinicio) || '04:00',
  diasNevera: a.dias_nevera ?? 30,
  diasBandeja: a.dias_bandeja ?? 7,
  cuadrantes: a.cuadrantes || {},
  actualizadoEn: a.updated_at,
})
const aColumnasAjustes = (c) => {
  const m = {}
  if ('horaReinicio' in c) m.hora_reinicio = c.horaReinicio
  if ('diasNevera' in c) m.dias_nevera = c.diasNevera
  if ('diasBandeja' in c) m.dias_bandeja = c.diasBandeja
  if ('cuadrantes' in c) m.cuadrantes = c.cuadrantes
  return m
}

/** Los ajustes, sembrando si aún no hay fila (primera apertura). */
export async function cargarAjustes() {
  listo()
  let r = await supabase.from('hoy_ajustes').select('*').maybeSingle()
  let a = uno(r, 'no se pudieron leer los ajustes')
  if (!a) {
    await sembrar()
    r = await supabase.from('hoy_ajustes').select('*').maybeSingle()
    a = uno(r, 'no se pudieron leer los ajustes')
  }
  return a ? aAjustes(a) : aAjustes({})
}

export async function guardarAjustes(cambios) {
  listo()
  const m = aColumnasAjustes(cambios)
  if (!Object.keys(m).length) return cargarAjustes()
  const { data: { user } = {} } = await supabase.auth.getUser()
  // upsert y no update: si por lo que sea no hay fila (sembrado a medias), nace aquí.
  const r = await supabase.from('hoy_ajustes').upsert({ owner_id: user?.id, ...m }, { onConflict: 'owner_id' }).select().single()
  return aAjustes(uno(r, 'no se pudieron guardar los ajustes'))
}

/** Idempotente: ajustes + 7 categorías del portal + pipeline «Principal» con 5 etapas. */
export async function sembrar() {
  listo()
  const { error } = await supabase.rpc('hoy_sembrar')
  if (error) throw new ErrorHoy('no se pudo sembrar', error)
  cachePipelines = null
  return true
}

/* ── PROYECTOS PROPIOS ─────────────────────────────────────────────────────── */

const aProyecto = (p) => ({
  id: p.id, nombre: p.nombre, color: p.color, icono: p.icono || '', posicion: p.posicion,
  archivadoEn: p.archivado_at, creadoEn: p.created_at,
})
const aColumnasProyecto = (c) => {
  const m = {}
  if ('nombre' in c) m.nombre = String(c.nombre || '').trim()
  if ('color' in c) m.color = c.color
  if ('icono' in c) m.icono = c.icono || ''
  if ('posicion' in c) m.posicion = c.posicion
  if ('archivadoEn' in c) m.archivado_at = c.archivadoEn
  return m
}

export async function cargarProyectos({ incluirArchivados = false } = {}) {
  listo()
  let q = supabase.from('hoy_proyectos').select('*').order('posicion').order('created_at')
  if (!incluirArchivados) q = q.is('archivado_at', null)
  return filas(await q, 'no se pudieron leer los proyectos').map(aProyecto)
}

export async function crearProyecto({ nombre, color, icono, posicion }) {
  listo()
  const fila = aColumnasProyecto({ nombre, color: color || '#f26b1b', icono: icono || '' })
  if (!fila.nombre) throw new ErrorHoy('un proyecto necesita nombre')
  fila.posicion = posicion ?? (await siguientePosicion('hoy_proyectos'))
  const r = await supabase.from('hoy_proyectos').insert(fila).select().single()
  return aProyecto(uno(r, 'no se pudo crear el proyecto'))
}

export async function actualizarProyecto(id, cambios) {
  listo()
  const m = aColumnasProyecto(cambios)
  if (!Object.keys(m).length) return null
  const r = await supabase.from('hoy_proyectos').update(m).eq('id', id).select().single()
  return aProyecto(uno(r, 'no se pudo guardar el proyecto'))
}

/** Archivar no es borrar: las tareas conservan su `proyecto_id`. */
export async function archivarProyecto(id, si = true) {
  return actualizarProyecto(id, { archivadoEn: si ? new Date().toISOString() : null })
}

/* ── CLIENTES Y EQUIPO DE GROWTHINFO (solo lectura) ────────────────────────── */

/** Los clientes que la RLS deje ver (sin `x-portal` → GrowthInfo). Entran como proyectos. */
export async function cargarClientes() {
  listo()
  const r = await supabase.from('clients').select('id, name, es_afiliados').order('name')
  return filas(r, 'no se pudieron leer los clientes').map((c) => ({
    id: c.id, nombre: c.name, esAfiliados: !!c.es_afiliados,
  }))
}

/** Las fichas activas de `team_members`: para el responsable de una tarea. */
export async function cargarEquipo() {
  listo()
  const r = await supabase.from('team_members').select('id, name, role_label, user_id').eq('active', true).order('name')
  return filas(r, 'no se pudo leer el equipo').map((m) => ({
    id: m.id, nombre: m.name, rol: m.role_label || '', userId: m.user_id || null,
  }))
}

/** Mi ficha de equipo (la que tiene mi `user_id`), o null si no hay. */
export async function cargarMiFicha() {
  listo()
  const { data: id, error } = await supabase.rpc('hoy_mi_ficha')
  if (error) throw new ErrorHoy('no se pudo leer mi ficha', error)
  if (!id) return null
  const r = await supabase.from('team_members').select('id, name, role_label, user_id').eq('id', id).maybeSingle()
  const m = uno(r, 'no se pudo leer mi ficha')
  return m ? { id: m.id, nombre: m.name, rol: m.role_label || '', userId: m.user_id || null } : null
}

/* ── CATEGORÍAS ────────────────────────────────────────────────────────────── */

const aCategoria = (c) => ({
  id: c.id, clave: c.clave, nombre: c.nombre, color: c.color, posicion: c.posicion,
  archivadoEn: c.archivado_at,
  // Las 7 del portal se pintan igual pero NO se pueden borrar ni cambiar de clave: una
  // tarea de GrowthInfo sólo admite esas.
  delPortal: CATEGORIAS_PORTAL.includes(c.clave),
})
const aColumnasCategoria = (c) => {
  const m = {}
  if ('clave' in c) m.clave = slug(c.clave)
  if ('nombre' in c) m.nombre = String(c.nombre || '').trim()
  if ('color' in c) m.color = c.color
  if ('posicion' in c) m.posicion = c.posicion
  if ('archivadoEn' in c) m.archivado_at = c.archivadoEn
  return m
}

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32)

export async function cargarCategorias({ incluirArchivadas = false } = {}) {
  listo()
  let q = supabase.from('hoy_categorias').select('*').order('posicion').order('created_at')
  if (!incluirArchivadas) q = q.is('archivado_at', null)
  return filas(await q, 'no se pudieron leer las categorías').map(aCategoria)
}

/** La clave sale del nombre si no se da; única por dueño (se numera si choca). */
export async function crearCategoria({ nombre, clave, color, posicion }) {
  listo()
  const existentes = await cargarCategorias({ incluirArchivadas: true })
  const usadas = new Set(existentes.map((c) => c.clave))
  let k = slug(clave || nombre) || 'categoria'
  if (usadas.has(k)) { let i = 2; while (usadas.has(`${k}_${i}`)) i += 1; k = `${k}_${i}` }
  const fila = aColumnasCategoria({ nombre, clave: k, color: color || '#8a8f98' })
  if (!fila.nombre) throw new ErrorHoy('una categoría necesita nombre')
  fila.posicion = posicion ?? (existentes.length ? Math.max(...existentes.map((c) => c.posicion)) + 1 : 0)
  const r = await supabase.from('hoy_categorias').insert(fila).select().single()
  return aCategoria(uno(r, 'no se pudo crear la categoría'))
}

export async function actualizarCategoria(id, cambios) {
  listo()
  // La clave de una del portal no se toca: es la que casa con `tasks.category`.
  const m = aColumnasCategoria(cambios)
  if (!Object.keys(m).length) return null
  const r = await supabase.from('hoy_categorias').update(m).eq('id', id).select().single()
  return aCategoria(uno(r, 'no se pudo guardar la categoría'))
}

export async function archivarCategoria(id, si = true) {
  return actualizarCategoria(id, { archivadoEn: si ? new Date().toISOString() : null })
}

/* ── PIPELINES Y ETAPAS (solo tareas personales) ───────────────────────────── */

const aEtapa = (e) => ({
  id: e.id, pipelineId: e.pipeline_id, nombre: e.nombre, clave: e.clave, color: e.color,
  posicion: e.posicion, esTerminal: !!e.es_terminal,
})
const aPipeline = (p) => ({
  id: p.id, nombre: p.nombre, esDefault: !!p.es_default, posicion: p.posicion, archivadoEn: p.archivado_at,
  etapas: (p.hoy_etapas || []).map(aEtapa).sort((a, b) => a.posicion - b.posicion),
})

// Se cachean porque `crear`/`completar` de una personal necesitan la etapa `todo`/`done`
// del tablero en cada llamada, y no cambian salvo que se editen desde Ajustes (que
// invalida). Un solo usuario: no hay nadie más que los cambie por detrás.
let cachePipelines = null

export async function cargarPipelines({ incluirArchivados = false, cache = true } = {}) {
  listo()
  if (cache && cachePipelines && !incluirArchivados) return cachePipelines
  let q = supabase.from('hoy_pipelines').select('*, hoy_etapas(*)').order('posicion').order('created_at')
  if (!incluirArchivados) q = q.is('archivado_at', null)
  const out = filas(await q, 'no se pudieron leer los tableros').map(aPipeline)
  if (!incluirArchivados) cachePipelines = out
  return out
}

/** El tablero por defecto (o el primero). Siembra si no hay ninguno. */
export async function pipelinePorDefecto() {
  let ps = await cargarPipelines()
  if (!ps.length) { await sembrar(); ps = await cargarPipelines({ cache: false }) }
  return ps.find((p) => p.esDefault) || ps[0] || null
}

export async function crearPipeline({ nombre, esDefault = false }) {
  listo()
  const n = String(nombre || '').trim()
  if (!n) throw new ErrorHoy('un tablero necesita nombre')
  const fila = { nombre: n, es_default: !!esDefault, posicion: await siguientePosicion('hoy_pipelines') }
  if (esDefault) await supabase.from('hoy_pipelines').update({ es_default: false }).eq('es_default', true)
  const r = await supabase.from('hoy_pipelines').insert(fila).select('*, hoy_etapas(*)').single()
  cachePipelines = null
  return aPipeline(uno(r, 'no se pudo crear el tablero'))
}

export async function actualizarPipeline(id, cambios) {
  listo()
  const m = {}
  if ('nombre' in cambios) m.nombre = String(cambios.nombre || '').trim()
  if ('posicion' in cambios) m.posicion = cambios.posicion
  if ('archivadoEn' in cambios) m.archivado_at = cambios.archivadoEn
  if ('esDefault' in cambios) m.es_default = !!cambios.esDefault
  if (m.es_default) await supabase.from('hoy_pipelines').update({ es_default: false }).eq('es_default', true).neq('id', id)
  const r = await supabase.from('hoy_pipelines').update(m).eq('id', id).select('*, hoy_etapas(*)').single()
  cachePipelines = null
  return aPipeline(uno(r, 'no se pudo guardar el tablero'))
}

/**
 * Nueva etapa. La clave sale del nombre; si coincide con una del vocabulario común
 * (`todo·in_progress·review·blocked·done`) el estado la seguirá al mover. Única por
 * tablero: se numera si choca.
 */
export async function crearEtapa(pipelineId, { nombre, clave, color, esTerminal = false, posicion } = {}) {
  listo()
  if (!pipelineId) throw new ErrorHoy('una etapa necesita tablero')
  const n = String(nombre || '').trim()
  if (!n) throw new ErrorHoy('una etapa necesita nombre')
  const ps = await cargarPipelines({ incluirArchivados: true, cache: false })
  const actuales = ps.find((p) => p.id === pipelineId)?.etapas || []
  const usadas = new Set(actuales.map((e) => e.clave))
  let k = slug(clave || n) || 'etapa'
  if (usadas.has(k)) { let i = 2; while (usadas.has(`${k}_${i}`)) i += 1; k = `${k}_${i}` }
  const fila = {
    pipeline_id: pipelineId, nombre: n, clave: k, color: color || '#8a8f98',
    es_terminal: !!esTerminal || k === 'done',
    posicion: posicion ?? (actuales.length ? Math.max(...actuales.map((e) => e.posicion)) + 1 : 0),
  }
  const r = await supabase.from('hoy_etapas').insert(fila).select().single()
  cachePipelines = null
  return aEtapa(uno(r, 'no se pudo crear la etapa'))
}

/**
 * Varias etapas de golpe (un tablero nuevo nace con las cinco del vocabulario): un solo
 * insert en vez de una vuelta con lectura por etapa. Las claves se dan tal cual: quien
 * llama es responsable de que no choquen entre sí ni con las que ya hay.
 */
export async function crearEtapas(pipelineId, lista = []) {
  listo()
  if (!pipelineId) throw new ErrorHoy('una etapa necesita tablero')
  const filasNuevas = lista.map((e, i) => {
    const n = String(e.nombre || '').trim()
    if (!n) throw new ErrorHoy('una etapa necesita nombre')
    const k = slug(e.clave || n) || `etapa_${i}`
    return {
      pipeline_id: pipelineId, nombre: n, clave: k, color: e.color || '#8a8f98',
      es_terminal: !!e.esTerminal || k === 'done', posicion: e.posicion ?? i,
    }
  })
  if (!filasNuevas.length) return []
  const r = await supabase.from('hoy_etapas').insert(filasNuevas).select()
  cachePipelines = null
  return filas(r, 'no se pudieron crear las etapas').map(aEtapa).sort((a, b) => a.posicion - b.posicion)
}

async function claveDeEtapa(id) {
  const r = await supabase.from('hoy_etapas').select('clave').eq('id', id).maybeSingle()
  return uno(r, 'no se pudo leer la etapa')?.clave || null
}

export async function actualizarEtapa(id, cambios) {
  listo()
  const m = {}
  if ('nombre' in cambios) m.nombre = String(cambios.nombre || '').trim()
  if ('color' in cambios) m.color = cambios.color
  if ('posicion' in cambios) m.posicion = cambios.posicion
  if ('esTerminal' in cambios) {
    // `done` siempre termina (misma regla que en `crearEtapa`): `completar()` mueve a
    // esa etapa con `hecha = esTerminal`, y una `done` no terminal dejaría la tarea en
    // «Hecho» contada como pendiente.
    const quiereQuitar = !cambios.esTerminal
    if (!quiereQuitar || (await claveDeEtapa(id)) !== 'done') m.es_terminal = !!cambios.esTerminal
  }
  if (!Object.keys(m).length) return null
  const r = await supabase.from('hoy_etapas').update(m).eq('id', id).select().single()
  cachePipelines = null
  return aEtapa(uno(r, 'no se pudo guardar la etapa'))
}

/**
 * Borrar una etapa deja a sus tareas sin columna (`on delete set null`): antes se
 * recolocan en `destinoId` si se da, para que no desaparezcan del tablero.
 */
export async function borrarEtapa(id, destinoId = null) {
  listo()
  if (destinoId) {
    // Recolocar es mover: se escriben los DOS ejes en una sola escritura, con la misma
    // regla que `cambiosAlMover` de tareas.js (LOGICA §1/§4). Si sólo se cambiara
    // `etapa_id`, una tarea que cae en «Hecho» seguiría `estado='todo'`/`hecha=false`, y
    // una que sale de «Hecho» seguiría hecha. No se importa tareas.js (sería circular).
    const ps = await cargarPipelines({ incluirArchivados: true, cache: false })
    const destino = ps.flatMap((p) => p.etapas).find((e) => e.id === destinoId)
    if (!destino) throw new ErrorHoy('la etapa de destino ya no existe')
    const m = {
      etapa_id: destino.id,
      pipeline_id: destino.pipelineId,
      ...(esEstado(destino.clave) ? { estado: destino.clave } : {}),
      hecha: destino.esTerminal,   // el trigger `hoy_touch` pone/quita `hecha_en`
    }
    ok(await supabase.from('hoy_tareas').update(m).eq('etapa_id', id), 'no se pudieron recolocar las tareas')
  }
  ok(await supabase.from('hoy_etapas').delete().eq('id', id), 'no se pudo borrar la etapa')
  cachePipelines = null
  return true
}

/** Orden nuevo: la posición es el índice en la lista de ids. */
export async function reordenarEtapas(pipelineId, idsEnOrden = []) {
  listo()
  for (let i = 0; i < idsEnOrden.length; i += 1) {
    ok(await supabase.from('hoy_etapas').update({ posicion: i }).eq('id', idsEnOrden[i]).eq('pipeline_id', pipelineId), 'no se pudo reordenar')
  }
  cachePipelines = null
  return true
}

/* ── TABLEROS DE CLIENTE (task_pipelines + task_stages del portal) ─────────── */

const aEtapaPortal = (s) => ({
  id: s.id, pipelineId: s.pipeline_id, nombre: s.name, clave: s.key, color: s.color,
  posicion: s.position, esTerminal: !!s.is_terminal,
})

// Misma razón que `cachePipelines`: completar una del portal necesita su etapa `done`.
// Los tableros de cliente los edita dirección desde el portal, muy de vez en cuando;
// `cache: false` relee.
const cacheTableros = new Map()

export async function cargarTablerosDeCliente(clientId, { cache = true } = {}) {
  listo()
  if (!clientId) return []
  if (cache && cacheTableros.has(clientId)) return cacheTableros.get(clientId)
  const ps = filas(
    await supabase.from('task_pipelines').select('*').eq('client_id', clientId).order('position').order('created_at'),
    'no se pudieron leer los tableros del cliente')
  const ids = ps.map((p) => p.id)
  const ss = ids.length
    ? filas(await supabase.from('task_stages').select('*').in('pipeline_id', ids).order('position'), 'no se pudieron leer las columnas del cliente')
    : []
  const out = ps.map((p) => ({
    id: p.id, clientId: p.client_id, nombre: p.name, esDefault: !!p.is_default, posicion: p.position,
    etapas: ss.filter((s) => s.pipeline_id === p.id).map(aEtapaPortal),
  }))
  cacheTableros.set(clientId, out)
  return out
}

/** El tablero por defecto del cliente (o el primero), o null si no tiene ninguno. */
export async function tableroPorDefectoDeCliente(clientId) {
  const ts = await cargarTablerosDeCliente(clientId)
  return ts.find((t) => t.esDefault) || ts[0] || null
}

export function vaciarCaches() {
  cachePipelines = null
  cacheTableros.clear()
}

/* ── util ──────────────────────────────────────────────────────────────────── */

async function siguientePosicion(tabla) {
  const r = await supabase.from(tabla).select('posicion').order('posicion', { ascending: false }).limit(1)
  const f = filas(r, 'no se pudo leer la posición')
  return f.length ? (Number(f[0].posicion) || 0) + 1 : 0
}
