/**
 * estadisticas.js — PURO. Entran tareas/días ya cargados, salen series para pintar.
 * Nada de Supabase aquí: todo se puede probar con un array.
 *
 * Un timestamp (`creadaEn`, `hechaEn`) se convierte a día LOCAL con `diaDe()`: en el
 * Mac de Alex (UTC+3) una tarea hecha a la 01:00 es de ese día, no del anterior.
 */
import { diaDe, rangoDias, sumarDias, aISO } from './fechas.js'

/** Hechas dentro de `[desde, hasta]` (por el día local de `hechaEn`). */
export function hechasEnRango(tareas, desde, hasta) {
  return (tareas || []).filter((t) => {
    if (!t.hecha || !t.hechaEn) return false
    const d = diaDe(t.hechaEn)
    return d >= desde && d <= hasta
  })
}

/** `[{ fecha, creadas, hechas }]` día a día entre `desde` y `hasta`, sin huecos. */
export function seriesCreadasHechas(tareas, desde, hasta) {
  const creadas = new Map()
  const hechas = new Map()
  for (const t of tareas || []) {
    const c = diaDe(t.creadaEn)
    if (c) creadas.set(c, (creadas.get(c) || 0) + 1)
    if (t.hecha && t.hechaEn) {
      const h = diaDe(t.hechaEn)
      hechas.set(h, (hechas.get(h) || 0) + 1)
    }
  }
  return rangoDias(desde, hasta).map((fecha) => ({
    fecha, creadas: creadas.get(fecha) || 0, hechas: hechas.get(fecha) || 0,
  }))
}

const agrupar = (tareas, claveDe, nombreDe) => {
  const m = new Map()
  for (const t of tareas || []) {
    const clave = claveDe(t) || 'sin'
    if (!m.has(clave)) m.set(clave, { clave, nombre: nombreDe(t, clave), n: 0 })
    m.get(clave).n += 1
  }
  return [...m.values()].sort((a, b) => b.n - a.n)
}

/**
 * Por proyecto. Un cliente de GrowthInfo cuenta como proyecto (clave `cliente:<id>`).
 * `catalogo` = `{ proyectos, clientes }` para poner nombre; sin él, la clave.
 */
export function porProyecto(tareas, { proyectos = [], clientes = [] } = {}) {
  const nombres = new Map([
    ...proyectos.map((p) => [p.id, p.nombre]),
    ...clientes.map((c) => [`cliente:${c.id}`, c.nombre]),
  ])
  return agrupar(
    tareas,
    (t) => (t.clientId ? `cliente:${t.clientId}` : t.proyectoId || 'sin'),
    (t, clave) => nombres.get(clave) || (clave === 'sin' ? 'Sin proyecto' : clave),
  )
}

export function porCategoria(tareas, categorias = []) {
  const nombres = new Map(categorias.map((c) => [c.clave, c.nombre]))
  return agrupar(tareas, (t) => t.categoria || 'sin', (t, clave) => nombres.get(clave) || (clave === 'sin' ? 'Sin categoría' : clave))
}

/** `cuadrantes` = el jsonb de ajustes (`{ q1: { nombre, color } … }`). */
export function porCuadrante(tareas, cuadrantes = {}) {
  return agrupar(tareas, (t) => t.cuadrante || 'sin', (t, clave) => cuadrantes[clave]?.nombre || (clave === 'sin' ? 'Sin cuadrante' : clave))
}

/** Días consecutivos con ≥ 1 hecha, terminando en `hoy` (hoy sin ninguna aún no rompe). */
export function rachaDias(tareas, hoy) {
  const dias = new Set((tareas || []).filter((t) => t.hecha && t.hechaEn).map((t) => diaDe(t.hechaEn)))
  let dia = aISO(hoy)
  if (!dias.has(dia)) dia = sumarDias(dia, -1)
  let n = 0
  while (dias.has(dia)) { n += 1; dia = sumarDias(dia, -1) }
  return n
}

/** Sobrecarga: planificadas vs hechas por día, de `hoy_dias`, ordenado por fecha. */
export function sobrecarga(dias) {
  return (dias || [])
    .map((d) => ({ fecha: d.fecha, planificadas: d.planificadas || 0, hechas: d.hechas || 0 }))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
}

/** Los 4 números de la pantalla Hoy. `hoy` = `hoyLocal(ajustes.horaReinicio)`. */
export function resumenHoy(tareas, hoy) {
  const vivas = (tareas || []).filter((t) => !t.archivadoEn)
  return {
    hechasHoy: vivas.filter((t) => t.hecha && diaDe(t.hechaEn) === hoy).length,
    enHoy: vivas.filter((t) => !t.hecha && t.hoyPara && t.hoyPara <= hoy).length,
    atrasadas: vivas.filter((t) => !t.hecha && t.vence && t.vence < hoy).length,
    bandeja: vivas.filter((t) => !t.hecha && !t.proyectoId && !t.clientId && !t.cuadrante).length,
    pendientes: vivas.filter((t) => !t.hecha).length,
  }
}
