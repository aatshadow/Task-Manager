/**
 * habitos.js — hábitos y marcas.
 *
 * Cadencia: `diario` (toca todos los días) · `dias` (toca los días ISO de `dias`, 1=L…7=D)
 * · `semana` (X veces por semana, el día da igual). Un hábito NO se borra: se archiva. Y un
 * día que no tocaba NO es un fallo (LOGICA §3.6): la racha sólo cuenta días que tocaban.
 */
import { supabase, isConfigured, ErrorHoy, filas, uno, ok } from '../lib/supabase.js'
import { aISO, sumarDias, diaSemanaISO, lunesDe, semanaDe } from './fechas.js'

const listo = () => {
  if (!isConfigured || !supabase) throw new ErrorHoy('Supabase no está configurado')
}

const aHabito = (h) => ({
  id: h.id, nombre: h.nombre, icono: h.icono || '', color: h.color,
  cadencia: h.cadencia || 'diario', dias: (h.dias || []).map(Number), vecesSemana: h.veces_semana || 1,
  posicion: h.posicion, archivadoEn: h.archivado_at, creadoEn: h.created_at,
})
const aColumnasHabito = (c) => {
  const m = {}
  if ('nombre' in c) m.nombre = String(c.nombre || '').trim()
  if ('icono' in c) m.icono = c.icono || ''
  if ('color' in c) m.color = c.color
  if ('cadencia' in c) m.cadencia = c.cadencia
  if ('dias' in c) m.dias = (c.dias || []).map(Number).filter((d) => d >= 1 && d <= 7)
  if ('vecesSemana' in c) m.veces_semana = Math.min(7, Math.max(1, Number(c.vecesSemana) || 1))
  if ('posicion' in c) m.posicion = c.posicion
  if ('archivadoEn' in c) m.archivado_at = c.archivadoEn
  return m
}

export async function cargarHabitos({ incluirArchivados = false } = {}) {
  listo()
  let q = supabase.from('hoy_habitos').select('*').order('posicion').order('created_at')
  if (!incluirArchivados) q = q.is('archivado_at', null)
  return filas(await q, 'no se pudieron leer los hábitos').map(aHabito)
}

export async function crearHabito({ nombre, icono, color, cadencia = 'diario', dias = [], vecesSemana = 1, posicion }) {
  listo()
  const fila = aColumnasHabito({ nombre, icono, color: color || '#ff6a1a', cadencia, dias, vecesSemana })
  if (!fila.nombre) throw new ErrorHoy('un hábito necesita nombre')
  if (posicion == null) {
    const f = filas(await supabase.from('hoy_habitos').select('posicion').order('posicion', { ascending: false }).limit(1))
    fila.posicion = f.length ? (f[0].posicion || 0) + 1 : 0
  } else fila.posicion = posicion
  const r = await supabase.from('hoy_habitos').insert(fila).select().single()
  return aHabito(uno(r, 'no se pudo crear el hábito'))
}

export async function actualizarHabito(id, cambios) {
  listo()
  const m = aColumnasHabito(cambios)
  if (!Object.keys(m).length) return null
  const r = await supabase.from('hoy_habitos').update(m).eq('id', id).select().single()
  return aHabito(uno(r, 'no se pudo guardar el hábito'))
}

export async function archivarHabito(id, si = true) {
  return actualizarHabito(id, { archivadoEn: si ? new Date().toISOString() : null })
}

/* ── marcas ────────────────────────────────────────────────────────────────── */

const aMarca = (m) => ({ habitoId: m.habito_id, fecha: m.fecha, nota: m.nota || '', marcadoEn: m.marcado_en })

export async function cargarMarcas(desde, hasta) {
  listo()
  let q = supabase.from('hoy_marcas').select('*').order('fecha')
  if (desde) q = q.gte('fecha', desde)
  if (hasta) q = q.lte('fecha', hasta)
  return filas(await q, 'no se pudieron leer las marcas').map(aMarca)
}

/** Marca (o desmarca) un hábito en una fecha. Una marca por (hábito, fecha). */
export async function marcar(habitoId, fecha, si = true, nota = '') {
  listo()
  if (!habitoId || !fecha) throw new ErrorHoy('falta el hábito o la fecha')
  if (!si) {
    ok(await supabase.from('hoy_marcas').delete().eq('habito_id', habitoId).eq('fecha', fecha), 'no se pudo desmarcar')
    return null
  }
  const r = await supabase.from('hoy_marcas').upsert({ habito_id: habitoId, fecha, nota: nota || '' }, { onConflict: 'habito_id,fecha' }).select().single()
  return aMarca(uno(r, 'no se pudo marcar'))
}

/* ── puras ─────────────────────────────────────────────────────────────────── */

/** ¿Toca este hábito en esta fecha? `semana` siempre se puede marcar. */
export function tocaHoy(h, fecha) {
  if (!h) return false
  if (h.cadencia === 'dias') return (h.dias || []).includes(diaSemanaISO(fecha))
  return true // diario y semana
}

const marcasDe = (h, marcas) => new Set((marcas || []).filter((m) => m.habitoId === h.id).map((m) => m.fecha))

/** Objetivo semanal según cadencia. */
export function objetivoSemana(h) {
  if (h.cadencia === 'dias') return (h.dias || []).length
  if (h.cadencia === 'semana') return h.vecesSemana || 1
  return 7
}

/** `{ hechas, objetivo }` de la semana (`semana` = `semanaDe(fecha)` o cualquier fecha de ella). */
export function cumplimientoSemana(h, marcas, semana) {
  const dias = Array.isArray(semana) ? semana : semanaDe(semana)
  const set = marcasDe(h, marcas)
  // Con cadencia `dias` sólo cuentan los que tocaban: marcar un martes que no toca no
  // sube el cumplimiento (y así `hechas` nunca pasa del objetivo).
  const hechas = dias.filter((d) => set.has(d) && (h.cadencia !== 'dias' || tocaHoy(h, d))).length
  return { hechas, objetivo: objetivoSemana(h) }
}

/**
 * Racha. Sólo cuenta lo que tocaba:
 *   · diario/dias: días consecutivos hacia atrás desde hoy (hoy sin marcar no rompe: el
 *     día sigue abierto), saltando los que no tocaban.
 *   · semana: semanas cerradas consecutivas con ≥ vecesSemana marcas; la semana en curso
 *     suma si ya llegó, y si no, no rompe.
 */
export function racha(h, marcas, hoy) {
  const set = marcasDe(h, marcas)
  if (h.cadencia === 'semana') {
    const objetivo = h.vecesSemana || 1
    const cuenta = (lunes) => semanaDe(lunes).filter((d) => set.has(d)).length
    let lunes = lunesDe(hoy)
    let n = 0
    if (cuenta(lunes) >= objetivo) n += 1
    lunes = sumarDias(lunes, -7)
    // Tope de 10 años: una racha no se pierde nunca en un bucle sin fin.
    for (let i = 0; i < 520; i += 1) {
      if (cuenta(lunes) < objetivo) break
      n += 1
      lunes = sumarDias(lunes, -7)
    }
    return n
  }
  let dia = aISO(hoy)
  let n = 0
  // Hoy sin marcar aún no es fallo: se empieza a contar desde ayer.
  if (!set.has(dia)) dia = sumarDias(dia, -1)
  for (let i = 0; i < 3660; i += 1) {
    if (!tocaHoy(h, dia)) { dia = sumarDias(dia, -1); continue }
    if (!set.has(dia)) break
    n += 1
    dia = sumarDias(dia, -1)
  }
  return n
}

/** Rejilla de las últimas `semanas` semanas (por defecto 4), de lunes a domingo, terminando en la de `hoy`. */
export function rejillaSemanas(h, marcas, hoy, semanas = 4) {
  const set = marcasDe(h, marcas)
  const lunes = lunesDe(hoy)
  const out = []
  for (let s = semanas - 1; s >= 0; s -= 1) {
    out.push(semanaDe(sumarDias(lunes, -7 * s)).map((fecha) => ({
      fecha, toca: tocaHoy(h, fecha), hecha: set.has(fecha), futuro: fecha > hoy,
    })))
  }
  return out
}
