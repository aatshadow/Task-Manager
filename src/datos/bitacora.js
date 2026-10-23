/**
 * Bitácora de Claude (LOGICA §14): lo que las sesiones de Claude Code dejaron apuntado.
 * Lo escriben el hook y el clasificador del Mac (`bitacora/bitacora.py`); aquí sólo se lee
 * y se pide «procesar ya» (el LaunchAgent lo recoge en su siguiente vuelta, ≤ 5 min).
 */
import { supabase, isConfigured, ErrorHoy, filas, ok } from '../lib/supabase.js'
import { aMinutos, sumarDias } from './fechas.js'
import { crear as crearTarea } from './tareas.js'

const VIVA_HORAS = 3 // §14.4: una marca de «trabajando» más vieja es una terminal cerrada a lo bruto

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
    ? filas(await supabase.from('hoy_tareas').select('id, titulo, hecha, estado, proyecto_id, hecha_en, archivado_at').in('id', idsTareas), 'no se pudieron leer las tareas')
    : []
  const porId = Object.fromEntries(tareas.map((t) => [t.id, { id: t.id, titulo: t.titulo, hecha: t.hecha, estado: t.estado, proyectoId: t.proyecto_id }]))
  const resultado = sesiones.map((s) => {
    const suyos = pasos.filter((p) => p.sesionId === s.id)
    const deTareas = [...new Set(suyos.map((p) => p.tareaId).filter(Boolean))].map((id) => ({
      ...(porId[id] || { id, titulo: '(tarea borrada)' }),
      pasos: suyos.filter((p) => p.tareaId === id).length,
    }))
    return {
      id: s.id, carpeta: s.carpeta, cwd: s.cwd, titulo: s.titulo || s.carpeta, resumen: s.resumen,
      inicio: suyos[0].inicio, fin: suyos[suyos.length - 1].fin, terminada: s.terminada,
      procesarPedido: s.procesar_pedido, procesadaEn: s.procesada_en,
      activoDesde: s.activo_desde && Date.now() - new Date(s.activo_desde) < VIVA_HORAS * 3600000 ? s.activo_desde : null,
      activoPedido: s.activo_pedido,
      pasos: suyos, tareas: deTareas, sinProcesar: suyos.filter((p) => !p.procesado).length,
    }
  }).sort((a, b) => (a.inicio < b.inicio ? 1 : -1))
  resultado.estados = Object.fromEntries(tareas.map((t) => [t.id, t]))
  return resultado
}

/**
 * El tablero (§14.4): qué tareas tocó Claude (últimos 30 días) y qué terminales están trabajando
 * ahora. Las columnas las arma la pantalla con las tareas del contexto, que son las que se mueven.
 */
export async function cargarTablero() {
  listo()
  const desde = new Date(Date.now() - 30 * 86400000).toISOString()
  const pasos = filas(await supabase.from('hoy_cc_pasos').select('sesion_id, tarea_id, fin, procesado').gte('inicio', desde), 'no se pudieron leer los pasos')
  const viva = new Date(Date.now() - VIVA_HORAS * 3600000).toISOString()
  const ids = [...new Set(pasos.map((p) => p.sesion_id))]
  const sesiones = filas(await supabase.from('hoy_cc_sesiones').select('id, titulo, carpeta, activo_desde, activo_pedido')
    .or(`activo_desde.gte.${viva}${ids.length ? `,id.in.(${ids.join(',')})` : ''}`), 'no se pudieron leer las sesiones')
  const porSesion = Object.fromEntries(sesiones.map((s) => [s.id, s]))

  // tareaId → de qué sesiones salió, cuántos pasos y cuándo se tocó por última vez
  const deClaude = new Map()
  const sinClasificar = new Map()
  for (const p of pasos) {
    if (!p.procesado) sinClasificar.set(p.sesion_id, (sinClasificar.get(p.sesion_id) || 0) + 1)
    if (!p.tarea_id) continue
    const t = deClaude.get(p.tarea_id) || { sesiones: new Set(), pasos: 0, ultimo: p.fin }
    t.sesiones.add(p.sesion_id)
    t.pasos += 1
    if (p.fin > t.ultimo) t.ultimo = p.fin
    deClaude.set(p.tarea_id, t)
  }
  const ids_t = [...deClaude.keys()]
  const estados = ids_t.length
    ? Object.fromEntries(filas(await supabase.from('hoy_tareas').select('id, estado, hecha, archivado_at').in('id', ids_t), 'no se pudieron leer las tareas').map((t) => [t.id, t]))
    : {}
  for (const t of deClaude.values()) {
    t.sesion = [...t.sesiones].map((id) => porSesion[id]).filter(Boolean).map((s) => s.titulo || s.carpeta).join(' · ')
  }
  const activas = sesiones.filter((s) => s.activo_desde && s.activo_desde >= viva)
    .map((s) => ({ id: s.id, titulo: s.titulo || s.carpeta, carpeta: s.carpeta, desde: s.activo_desde, pedido: s.activo_pedido }))
  const clasificando = [...sinClasificar.entries()]
    .filter(([id]) => !activas.some((a) => a.id === id) && porSesion[id])
    .map(([id, n]) => ({ id, titulo: porSesion[id].titulo || porSesion[id].carpeta, pasos: n }))
  return { deClaude, activas, clasificando, estados }
}

/**
 * ¿La memoria de la app va por detrás de la base? (§14.4: tablero y sesiones a la par). `estados` =
 * { id: { estado, hecha } } leído ahora; si alguna tarea falta o tiene otro estado en `tareas`, toca recargar.
 */
export function desfasadas(estados, tareas) {
  const porId = new Map(tareas.map((t) => [t.id, t]))
  return Object.values(estados).some((b) => {
    if (b.archivado_at) return false // la app no carga las archivadas: no es desfase
    const m = porId.get(b.id)
    return !m || m.hecha !== !!b.hecha || (!b.hecha && m.estado !== b.estado)
  })
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

/* ── Próximos pasos (§14.6) ─────────────────────────────────────────────────── */

const aProximo = (f) => ({
  id: f.id, sesionId: f.sesion_id, reunionId: f.reunion_id, titulo: f.titulo, descripcion: f.descripcion, proyectoId: f.proyecto_id, clientId: f.client_id,
  categoria: f.categoria, cuadrante: f.cuadrante, dia: f.dia, minutos: f.minutos, orden: f.orden,
  estado: f.estado, origen: f.origen, creadoEn: f.created_at,
})

/** Los propuestos, agrupados por sesión (la más reciente primero), con el título de la sesión. */
export async function cargarProximos() {
  listo()
  const lista = filas(await supabase.from('hoy_proximos').select('*').eq('estado', 'propuesto').order('created_at', { ascending: false }), 'no se pudieron leer los próximos pasos').map(aProximo)
  const ids = [...new Set(lista.map((p) => p.sesionId).filter(Boolean))]
  const idsR = [...new Set(lista.map((p) => p.reunionId).filter(Boolean))]
  const sesiones = ids.length
    ? Object.fromEntries(filas(await supabase.from('hoy_cc_sesiones').select('id, titulo, carpeta, ultimo').in('id', ids), 'no se pudieron leer las sesiones').map((s) => [s.id, s]))
    : {}
  const reuniones = idsR.length
    ? Object.fromEntries(filas(await supabase.from('hoy_reuniones').select('id, titulo, fin').in('id', idsR), 'no se pudieron leer las reuniones').map((r) => [r.id, r]))
    : {}
  const grupos = new Map()
  for (const p of lista) {
    const clave = p.reunionId ? `r:${p.reunionId}` : p.sesionId || 'sin-sesion'
    if (!grupos.has(clave)) {
      const s = sesiones[p.sesionId]
      const r = reuniones[p.reunionId]
      grupos.set(clave, {
        id: clave, reunion: !!r,
        titulo: r ? r.titulo : s ? (s.titulo || s.carpeta) : 'Propuestos por Claude',
        ultimo: r?.fin || s?.ultimo || p.creadoEn, pasos: [],
      })
    }
    grupos.get(clave).pasos.push(p)
  }
  for (const g of grupos.values()) g.pasos.sort((a, b) => a.orden - b.orden)
  return [...grupos.values()].sort((a, b) => (a.ultimo < b.ultimo ? 1 : -1))
}

/** Aceptar = crear la tarea para ese día (con proyecto, categoría y cuadrante) y dejar el paso apuntando a ella. */
export async function aceptarProximo(p, dia = p.dia) {
  listo()
  const tarea = await crearTarea({
    titulo: p.titulo, descripcion: p.descripcion, origen: 'hoy', proyectoId: p.proyectoId, clientId: p.clientId,
    categoria: p.categoria, cuadrante: p.cuadrante, hoyPara: dia || null,
    notas: 'Próximo paso validado desde la bitácora de Claude',
  })
  ok(await supabase.from('hoy_proximos').update({ estado: 'aceptado', tarea_id: tarea.id, dia: dia || null, decidido_en: new Date().toISOString() }).eq('id', p.id), 'no se pudo marcar el paso')
  return tarea
}

export async function descartarProximo(id) {
  listo()
  ok(await supabase.from('hoy_proximos').update({ estado: 'descartado', decidido_en: new Date().toISOString() }).eq('id', id), 'no se pudo descartar')
}

export async function cambiarDiaProximo(id, dia) {
  listo()
  ok(await supabase.from('hoy_proximos').update({ dia: dia || null }).eq('id', id), 'no se pudo cambiar el día')
}

/* ── Reuniones de Wispr Flow (§14.7) ───────────────────────────────────────── */

/** Las reuniones de los últimos `dias`, la más reciente primero, con cuántas tareas dejó (propuestas y aceptadas). */
export async function cargarReuniones(dias = 30) {
  listo()
  const desde = new Date(Date.now() - dias * 86400000).toISOString()
  const rs = filas(await supabase.from('hoy_reuniones').select('id, titulo, titulo_wispr, inicio, fin, minutos, resumen, decisiones, proyecto_id, client_id')
    .gte('inicio', desde).order('inicio', { ascending: false }), 'no se pudieron leer las reuniones')
  const ids = rs.map((r) => r.id)
  const px = ids.length ? filas(await supabase.from('hoy_proximos').select('reunion_id, estado').in('reunion_id', ids), 'no se pudieron leer sus tareas') : []
  return rs.map((r) => ({
    id: r.id, titulo: r.titulo || r.titulo_wispr, inicio: r.inicio, minutos: r.minutos, resumen: r.resumen,
    decisiones: r.decisiones || [], proyectoId: r.proyecto_id, clientId: r.client_id,
    propuestas: px.filter((p) => p.reunion_id === r.id && p.estado === 'propuesto').length,
    aceptadas: px.filter((p) => p.reunion_id === r.id && p.estado === 'aceptado').length,
  }))
}
