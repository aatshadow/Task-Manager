/**
 * hitos.js — los lanzamientos de los frentes (LOGICA §10.5).
 *
 * Un hito es un nombre con frente y fecha (o sin fecha). No es una tarea: no se
 * planifica; se ve en Hoy como «en 3 días» y se marca hecho cuando pasa. Desde §5.4
 * puede durar: `inicio` (opcional) → `fecha` (el final), y en el Gantt se arrastra.
 * `clientId` es texto suelto: un frente puede no existir aún en `clients`.
 */
import { supabase, isConfigured, ErrorHoy, filas, uno, ok } from '../lib/supabase.js'
import { diasEntre } from './fechas.js'

const listo = () => {
  if (!isConfigured || !supabase) throw new ErrorHoy('Supabase no está configurado')
}

const aHito = (h) => ({
  id: h.id, nombre: h.nombre, frente: h.frente || '', fecha: h.fecha || null, inicio: h.inicio || null,
  clientId: h.client_id || null, hecho: !!h.hecho, posicion: h.posicion ?? 0, creadoEn: h.created_at,
})
const aColumnas = (c) => {
  const m = {}
  if ('nombre' in c) m.nombre = String(c.nombre || '').trim()
  if ('frente' in c) m.frente = String(c.frente || '').trim()
  if ('fecha' in c) m.fecha = c.fecha || null
  if ('inicio' in c) m.inicio = c.inicio || null
  if ('clientId' in c) m.client_id = c.clientId || null
  if ('hecho' in c) m.hecho = !!c.hecho
  if ('posicion' in c) m.posicion = c.posicion
  return m
}

export async function cargarHitos({ incluirHechos = true } = {}) {
  listo()
  let q = supabase.from('hoy_hitos').select('*').order('posicion').order('fecha', { nullsFirst: false })
  if (!incluirHechos) q = q.eq('hecho', false)
  return filas(await q, 'no se pudieron leer los hitos').map(aHito)
}

export async function crearHito({ nombre, frente = '', fecha = null, inicio = null, clientId = null, posicion }) {
  listo()
  const fila = aColumnas({ nombre, frente, fecha, inicio, clientId })
  if (!fila.nombre) throw new ErrorHoy('un hito necesita nombre')
  if (posicion == null) {
    const f = filas(await supabase.from('hoy_hitos').select('posicion').order('posicion', { ascending: false }).limit(1))
    fila.posicion = f.length ? (f[0].posicion || 0) + 1 : 0
  } else fila.posicion = posicion
  const r = await supabase.from('hoy_hitos').insert(fila).select().single()
  return aHito(uno(r, 'no se pudo crear el hito'))
}

export async function actualizarHito(id, cambios) {
  listo()
  const m = aColumnas(cambios)
  if (!Object.keys(m).length) return null
  const r = await supabase.from('hoy_hitos').update(m).eq('id', id).select().single()
  return aHito(uno(r, 'no se pudo guardar el hito'))
}

export async function borrarHito(id) {
  listo()
  ok(await supabase.from('hoy_hitos').delete().eq('id', id), 'no se pudo borrar el hito')
  return true
}

/* ── puras ─────────────────────────────────────────────────────────────────── */

/** Días que faltan (negativo si ya pasó; `null` sin fecha). */
export function diasHasta(hito, hoy) {
  if (!hito?.fecha) return null
  return diasEntre(hoy, hito.fecha)
}

/** «hoy» · «mañana» · «en 3 días» · «hace 2 días» · «sin fecha». */
export function textoHito(hito, hoy) {
  const d = diasHasta(hito, hoy)
  if (d == null) return 'sin fecha'
  if (d === 0) return 'hoy'
  if (d === 1) return 'mañana'
  if (d > 1) return `en ${d} días`
  if (d === -1) return 'ayer'
  return `hace ${-d} días`
}

/** Rojo si ≤ 3 días (o ya pasado y no hecho). */
export const urgente = (hito, hoy) => {
  const d = diasHasta(hito, hoy)
  return d != null && d <= 3 && !hito.hecho
}

/** Orden para pintar: con fecha primero (la más cercana antes), luego sin fecha; los hechos al final. */
export function ordenarHitos(hitos, hoy) {
  return [...(hitos || [])].sort((a, b) => {
    if (a.hecho !== b.hecho) return a.hecho ? 1 : -1
    const da = diasHasta(a, hoy); const db = diasHasta(b, hoy)
    if (da == null && db == null) return a.posicion - b.posicion
    if (da == null) return 1
    if (db == null) return -1
    return da - db || a.posicion - b.posicion
  })
}

/**
 * Inicio y fin de un hito tras arrastrarlo `delta` días (§5.4). `modo`: 'mover' (las dos fechas),
 * 'inicio' o 'fin' (sólo ese borde, sin cruzar el otro). Un hito sin inicio sólo se mueve.
 */
export function moverHito(hito, modo, delta, sumar) {
  if (!hito?.fecha || !delta) return { inicio: hito?.inicio || null, fecha: hito?.fecha || null }
  if (!hito.inicio || modo === 'mover') {
    return { inicio: hito.inicio ? sumar(hito.inicio, delta) : null, fecha: sumar(hito.fecha, delta) }
  }
  if (modo === 'inicio') {
    const inicio = sumar(hito.inicio, delta)
    return { inicio: inicio > hito.fecha ? hito.fecha : inicio, fecha: hito.fecha }
  }
  const fecha = sumar(hito.fecha, delta)
  return { inicio: hito.inicio, fecha: fecha < hito.inicio ? hito.inicio : fecha }
}
