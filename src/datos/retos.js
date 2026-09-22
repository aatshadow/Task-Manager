/**
 * retos.js — el marcador (LOGICA §10.0-4).
 *
 * Un reto es un tramo de fechas con nombre («Zero Agent Challenge», 23-09 → 21-12). Día
 * del reto = días desde `inicio` + 1, con tope en el total. Antes del inicio, `antes`;
 * después del fin, `terminado`. El reto NO guarda marcas: la adherencia sale de los
 * hábitos y sus marcas (`habitos.js`) y de `hoy_dias` para los días cerrados.
 */
import { supabase, isConfigured, ErrorHoy, filas, uno } from '../lib/supabase.js'
import { diasEntre, rangoDias } from './fechas.js'

const listo = () => {
  if (!isConfigured || !supabase) throw new ErrorHoy('Supabase no está configurado')
}

const aReto = (r) => ({
  id: r.id, nombre: r.nombre, descripcion: r.descripcion || '',
  inicio: r.inicio, fin: r.fin, activo: r.activo !== false, creadoEn: r.created_at,
})
const aColumnas = (c) => {
  const m = {}
  if ('nombre' in c) m.nombre = String(c.nombre || '').trim()
  if ('descripcion' in c) m.descripcion = c.descripcion || ''
  if ('inicio' in c) m.inicio = c.inicio
  if ('fin' in c) m.fin = c.fin
  if ('activo' in c) m.activo = !!c.activo
  return m
}

/** Todos los retos (activos primero, el más reciente antes). */
export async function cargarRetos() {
  listo()
  const r = await supabase.from('hoy_retos').select('*').order('activo', { ascending: false }).order('inicio', { ascending: false })
  return filas(r, 'no se pudieron leer los retos').map(aReto)
}

/**
 * El reto que manda en `fecha`: el activo que la contiene; si ninguno la contiene, el
 * activo que empieza más pronto después de ella (para enseñar «empieza mañana»); si no,
 * el último activo (para enseñar «completado»). `null` si no hay ninguno.
 */
export async function cargarReto(fecha) {
  const retos = (await cargarRetos()).filter((r) => r.activo)
  return retoVigente(retos, fecha)
}

export function retoVigente(retos, fecha) {
  const activos = (retos || []).filter((r) => r.activo !== false)
  if (!activos.length) return null
  const dentro = activos.find((r) => r.inicio <= fecha && fecha <= r.fin)
  if (dentro) return dentro
  const futuros = activos.filter((r) => r.inicio > fecha).sort((a, b) => a.inicio.localeCompare(b.inicio))
  if (futuros.length) return futuros[0]
  return activos.sort((a, b) => b.fin.localeCompare(a.fin))[0]
}

export async function guardarReto(id, cambios) {
  listo()
  const m = aColumnas(cambios)
  if (!id) {
    if (!m.nombre) throw new ErrorHoy('un reto necesita nombre')
    if (!m.inicio || !m.fin) throw new ErrorHoy('un reto necesita inicio y fin')
    const r = await supabase.from('hoy_retos').insert(m).select().single()
    return aReto(uno(r, 'no se pudo crear el reto'))
  }
  if (!Object.keys(m).length) return null
  const r = await supabase.from('hoy_retos').update(m).eq('id', id).select().single()
  return aReto(uno(r, 'no se pudo guardar el reto'))
}

/* ── puras ─────────────────────────────────────────────────────────────────── */

/** Cuántos días tiene el reto (23-09 → 21-12 = 90). */
export const totalDias = (reto) => (reto ? diasEntre(reto.inicio, reto.fin) + 1 : 0)

/**
 * `{ dia, total, antes, terminado, faltan }`: el día del reto en `hoy` (1..total). Antes
 * del inicio `dia` = 0 y `faltan` = días que quedan para empezar; después del fin
 * `dia` = total.
 */
export function diaDelReto(reto, hoy) {
  if (!reto) return { dia: 0, total: 0, antes: false, terminado: false, faltan: 0 }
  const total = totalDias(reto)
  if (hoy < reto.inicio) return { dia: 0, total, antes: true, terminado: false, faltan: diasEntre(hoy, reto.inicio) }
  if (hoy > reto.fin) return { dia: total, total, antes: false, terminado: true, faltan: 0 }
  return { dia: diasEntre(reto.inicio, hoy) + 1, total, antes: false, terminado: false, faltan: 0 }
}

/** Las fechas del reto, de la primera a la última (90 para el Zero Agent Challenge). */
export function fechasDelReto(reto) {
  if (!reto) return []
  return rangoDias(reto.inicio, reto.fin)
}
