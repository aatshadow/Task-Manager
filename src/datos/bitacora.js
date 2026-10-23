/**
 * Bitácora de Claude (LOGICA §14): lo que las sesiones de Claude Code dejaron apuntado.
 * Lo escriben el hook y el clasificador del Mac (`bitacora/bitacora.py`); aquí sólo se lee
 * y se pide «procesar ya» (el LaunchAgent lo recoge en su siguiente vuelta, ≤ 5 min).
 */
import { supabase, isConfigured, ErrorHoy, filas, ok } from '../lib/supabase.js'
import { aMinutos, sumarDias } from './fechas.js'

const listo = () => {
  if (!isConfigured || !supabase) throw new ErrorHoy('Supabase no está configurado')
}

// El día lógico `fecha` va de su hora de reinicio a la del día siguiente, en hora local.
function limitesDelDia(fecha, horaReinicio = '04:00') {
  const m = aMinutos(horaReinicio)
  const aInstante = (iso) => {
    const [a, mes, d] = iso.split('-').map(Number)
    return new Date(a, mes - 1, d, Math.floor(m / 60), m % 60).toISOString()
  }
  return { desde: aInstante(fecha), hasta: aInstante(sumarDias(fecha, 1)) }
}

const aPaso = (f) => ({
  id: f.id, sesionId: f.sesion_id, inicio: f.inicio, fin: f.fin, pedido: f.pedido, respuesta: f.respuesta,
  herramientas: f.herramientas || {}, archivos: f.archivos || [], comandos: f.comandos || [],
  tareaId: f.tarea_id, procesado: f.procesado,
})

/** Las sesiones con algún paso en el día lógico `fecha`, cada una con SUS pasos de ese día y sus tareas. */
export async function cargarDia(fecha, horaReinicio) {
  listo()
  const { desde, hasta } = limitesDelDia(fecha, horaReinicio)
  const pasos = filas(await supabase.from('hoy_cc_pasos').select('*').gte('inicio', desde).lt('inicio', hasta).order('inicio'), 'no se pudieron leer los pasos').map(aPaso)
  const ids = [...new Set(pasos.map((p) => p.sesionId))]
  if (!ids.length) return []
  const sesiones = filas(await supabase.from('hoy_cc_sesiones').select('*').in('id', ids), 'no se pudieron leer las sesiones')
  const idsTareas = [...new Set(pasos.map((p) => p.tareaId).filter(Boolean))]
  const tareas = idsTareas.length
    ? filas(await supabase.from('hoy_tareas').select('id, titulo, hecha, estado, proyecto_id, hecha_en').in('id', idsTareas), 'no se pudieron leer las tareas')
    : []
  const porId = Object.fromEntries(tareas.map((t) => [t.id, { id: t.id, titulo: t.titulo, hecha: t.hecha, estado: t.estado, proyectoId: t.proyecto_id }]))
  return sesiones.map((s) => {
    const suyos = pasos.filter((p) => p.sesionId === s.id)
    const deTareas = [...new Set(suyos.map((p) => p.tareaId).filter(Boolean))].map((id) => ({
      ...(porId[id] || { id, titulo: '(tarea borrada)' }),
      pasos: suyos.filter((p) => p.tareaId === id).length,
    }))
    return {
      id: s.id, carpeta: s.carpeta, cwd: s.cwd, titulo: s.titulo || s.carpeta, resumen: s.resumen,
      inicio: suyos[0].inicio, fin: suyos[suyos.length - 1].fin, terminada: s.terminada,
      procesarPedido: s.procesar_pedido, procesadaEn: s.procesada_en,
      pasos: suyos, tareas: deTareas, sinProcesar: suyos.filter((p) => !p.procesado).length,
    }
  }).sort((a, b) => (a.inicio < b.inicio ? 1 : -1))
}

/** Enciende `procesar_pedido`: el clasificador la procesa en su próxima vuelta aunque no esté quieta. */
export async function pedirProceso(sesionId) {
  listo()
  ok(await supabase.from('hoy_cc_sesiones').update({ procesar_pedido: true }).eq('id', sesionId), 'no se pudo pedir el proceso')
}

/** Puro: los totales del día. Minutos = suma de la duración de cada paso (lo que Claude estuvo trabajando). */
export function resumenDia(sesiones) {
  const tareas = new Map()
  let pasos = 0, minutos = 0, sinProcesar = 0
  for (const s of sesiones) {
    pasos += s.pasos.length
    sinProcesar += s.sinProcesar
    for (const p of s.pasos) minutos += Math.max(0, (new Date(p.fin) - new Date(p.inicio)) / 60000)
    for (const t of s.tareas) tareas.set(t.id, t)
  }
  const lista = [...tareas.values()]
  return {
    sesiones: sesiones.length, pasos, sinProcesar, minutos: Math.round(minutos),
    hechas: lista.filter((t) => t.hecha).length, abiertas: lista.filter((t) => !t.hecha).length,
  }
}
