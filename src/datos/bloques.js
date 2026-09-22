/**
 * bloques.js — el raíl del día (LOGICA §10.1).
 *
 * Un bloque es un tramo fijo con hora (`inicio`–`fin`) que toca unos días de la semana
 * (`dias`, ISO 1=L…7=D). No es una tarea: no se hace ni se deja de hacer, sólo está. Las
 * tareas se arrastran dentro; los hábitos cuelgan de él (`bloqueId`).
 *
 * Un bloque cuyo `fin` es menor que su `inicio` cruza medianoche (Sueño 22:00–04:30): a
 * las 03:00 del martes «toca» porque empezó el lunes a las 22:00. Por eso `bloqueActual`
 * mira también el día anterior.
 */
import { supabase, isConfigured, ErrorHoy, filas, uno, ok } from '../lib/supabase.js'
import { aMinutos, deMinutos, diaSemanaISO, horaCorta, sumarDias } from './fechas.js'

const listo = () => {
  if (!isConfigured || !supabase) throw new ErrorHoy('Supabase no está configurado')
}

export const FASES = [
  { clave: 'calibracion', nombre: 'Calibración' },
  { clave: 'nutricion', nombre: 'Nutrición' },
  { clave: 'cuerpo', nombre: 'Cuerpo' },
  { clave: 'ofensiva', nombre: 'Ofensiva' },
  { clave: 'reuniones', nombre: 'Reuniones' },
  { clave: 'consolidacion', nombre: 'Consolidación' },
  { clave: 'apagado', nombre: 'Apagado' },
]
export const nombreFase = (clave) => FASES.find((f) => f.clave === clave)?.nombre || clave || ''
/** El color de una fase como token CSS (`var(--fase-ofensiva)`); un bloque con `color` propio manda. */
export const colorBloque = (b) => (b?.color ? b.color : `var(--fase-${FASES.some((f) => f.clave === b?.fase) ? b.fase : 'apagado'})`)

const aBloque = (b) => ({
  id: b.id, nombre: b.nombre, fase: b.fase,
  inicio: horaCorta(b.inicio), fin: horaCorta(b.fin),
  dias: (b.dias || []).map(Number), icono: b.icono || '', color: b.color || '',
  posicion: b.posicion ?? 0, activo: b.activo !== false,
  archivadoEn: b.archivado_at, creadoEn: b.created_at,
})
const aColumnas = (c) => {
  const m = {}
  if ('nombre' in c) m.nombre = String(c.nombre || '').trim()
  if ('fase' in c) m.fase = c.fase
  if ('inicio' in c) m.inicio = c.inicio
  if ('fin' in c) m.fin = c.fin
  if ('dias' in c) m.dias = (c.dias || []).map(Number).filter((d) => d >= 1 && d <= 7)
  if ('icono' in c) m.icono = c.icono || ''
  if ('color' in c) m.color = c.color || ''
  if ('posicion' in c) m.posicion = c.posicion
  if ('activo' in c) m.activo = !!c.activo
  if ('archivadoEn' in c) m.archivado_at = c.archivadoEn
  return m
}

export async function cargarBloques({ incluirArchivados = false } = {}) {
  listo()
  let q = supabase.from('hoy_bloques').select('*').order('posicion').order('inicio')
  if (!incluirArchivados) q = q.is('archivado_at', null)
  return filas(await q, 'no se pudieron leer los bloques').map(aBloque)
}

export async function crearBloque({ nombre, fase = 'ofensiva', inicio, fin, dias = [1, 2, 3, 4, 5, 6, 7], icono = '', color = '', posicion }) {
  listo()
  const fila = aColumnas({ nombre, fase, inicio, fin, dias, icono, color })
  if (!fila.nombre) throw new ErrorHoy('un bloque necesita nombre')
  if (!fila.inicio || !fila.fin) throw new ErrorHoy('un bloque necesita hora de inicio y de fin')
  if (posicion == null) {
    const f = filas(await supabase.from('hoy_bloques').select('posicion').order('posicion', { ascending: false }).limit(1))
    fila.posicion = f.length ? (f[0].posicion || 0) + 1 : 0
  } else fila.posicion = posicion
  const r = await supabase.from('hoy_bloques').insert(fila).select().single()
  return aBloque(uno(r, 'no se pudo crear el bloque'))
}

export async function actualizarBloque(id, cambios) {
  listo()
  const m = aColumnas(cambios)
  if (!Object.keys(m).length) return null
  const r = await supabase.from('hoy_bloques').update(m).eq('id', id).select().single()
  return aBloque(uno(r, 'no se pudo guardar el bloque'))
}

/** Borrar de verdad: los hábitos que colgaban se quedan sin bloque (`on delete set null`). */
export async function borrarBloque(id) {
  listo()
  ok(await supabase.from('hoy_bloques').delete().eq('id', id), 'no se pudo borrar el bloque')
  return true
}

export async function reordenarBloques(ids) {
  listo()
  await Promise.all(ids.map((id, i) => supabase.from('hoy_bloques').update({ posicion: i }).eq('id', id).then((r) => ok(r, 'no se pudo reordenar'))))
  return true
}

/** «Restaurar el protocolo»: vuelve a dejar bloques y hábitos como dicta §10 (las marcas no se tocan). */
export async function restaurarProtocolo() {
  listo()
  const { error } = await supabase.rpc('hoy_sembrar_protocolo', { p_restaurar: true })
  if (error) throw new ErrorHoy('no se pudo restaurar el protocolo', error)
  return true
}

/* ── puras ─────────────────────────────────────────────────────────────────── */

const vivo = (b) => b && b.activo !== false && !b.archivadoEn
export const cruzaMedianoche = (b) => aMinutos(b.fin) <= aMinutos(b.inicio)

/** ¿Toca este bloque en esta fecha (por su día de la semana)? */
export function tocaBloque(b, fecha) {
  if (!vivo(b)) return false
  const dias = b.dias || []
  return !dias.length || dias.includes(diaSemanaISO(fecha))
}

/** Los bloques que tocan en `fecha`, en orden de posición y hora. */
export function bloquesDelDia(bloques, fecha) {
  return (bloques || []).filter((b) => tocaBloque(b, fecha))
    .sort((a, b) => (a.posicion - b.posicion) || (aMinutos(a.inicio) - aMinutos(b.inicio)))
}

/**
 * ¿Contiene el bloque la hora `hhmm` de la fecha dada? Para uno que cruza medianoche
 * (22:00–04:30) contiene las 23:30 del día en que empieza y las 03:00 del siguiente.
 */
export function contiene(b, fecha, hhmm) {
  const m = aMinutos(hhmm)
  const ini = aMinutos(b.inicio)
  const fin = aMinutos(b.fin)
  if (!cruzaMedianoche(b)) return tocaBloque(b, fecha) && m >= ini && m < fin
  // tramo de la noche: empezó hoy
  if (m >= ini && tocaBloque(b, fecha)) return true
  // tramo de la madrugada: empezó ayer
  return m < fin && tocaBloque(b, sumarDias(fecha, -1))
}

/** El bloque que contiene la hora de ahora. Si dos se solapan gana el de menor posición. */
export function bloqueActual(bloques, fecha, hhmm) {
  return (bloques || []).filter((b) => vivo(b) && contiene(b, fecha, hhmm))
    .sort((a, b) => (a.posicion - b.posicion) || (aMinutos(a.inicio) - aMinutos(b.inicio)))[0] || null
}

/**
 * El primero que empieza después de ahora, hoy; si no queda ninguno, el primero de
 * mañana (con `fecha` = mañana en el resultado).
 */
export function siguienteBloque(bloques, fecha, hhmm) {
  const m = aMinutos(hhmm)
  const hoy = bloquesDelDia(bloques, fecha)
    .filter((b) => aMinutos(b.inicio) > m)
    .sort((a, b) => aMinutos(a.inicio) - aMinutos(b.inicio))
  if (hoy.length) return { bloque: hoy[0], fecha }
  const manana = sumarDias(fecha, 1)
  const siguientes = bloquesDelDia(bloques, manana).sort((a, b) => aMinutos(a.inicio) - aMinutos(b.inicio))
  return siguientes.length ? { bloque: siguientes[0], fecha: manana } : null
}

/** Minutos que quedan de un bloque a la hora `hhmm` (0 si ya acabó o no ha empezado). */
export function minutosRestantes(b, hhmm) {
  if (!b) return 0
  const m = aMinutos(hhmm)
  const ini = aMinutos(b.inicio)
  let fin = aMinutos(b.fin)
  if (cruzaMedianoche(b)) {
    // 22:00–04:30: a las 23:30 quedan 300; a las 03:00 quedan 90
    if (m >= ini) fin += 24 * 60
    else if (m >= fin) return 0
  } else if (m < ini || m >= fin) return 0
  return Math.max(0, fin - m)
}

/** Duración en minutos (cruce de medianoche incluido). */
export function duracion(b) {
  const ini = aMinutos(b.inicio)
  const fin = aMinutos(b.fin)
  return cruzaMedianoche(b) ? fin + 24 * 60 - ini : fin - ini
}

/** «1h 12m» · «45m» · «2h». */
export function textoMinutos(min) {
  const n = Math.max(0, Math.round(min))
  const h = Math.floor(n / 60)
  const m = n % 60
  if (!h) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}

/** `'HH:MM'` de la hora a la que acaba el bloque actual (para «hasta las 11:00»). */
export const horaFin = (b) => deMinutos(aMinutos(b.fin))
