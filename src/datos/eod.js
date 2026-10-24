/**
 * eod.js — el cierre del día (LOGICA §16).
 *
 * Una fila de `hoy_eod` por día LÓGICO: el que cambia a la hora de reinicio (04:00), no a
 * medianoche. Por eso el EOD de hoy se puede rellenar hasta las 04:00 y luego nace otro.
 * Aquí sólo las respuestas y el «cerrado»; sueño, peso y dientes son marcas de hábitos.
 */
import { supabase, isConfigured, ErrorHoy, uno } from '../lib/supabase.js'
import { diaDe } from './fechas.js'

const listo = () => {
  if (!isConfigured || !supabase) throw new ErrorHoy('Supabase no está configurado')
}

const aEod = (f) => ({ fecha: f.fecha, respuestas: f.respuestas || {}, cerradoEn: f.cerrado_en || null })

/** El EOD de un día, o uno vacío si aún no hay fila. */
export async function cargarEod(fecha) {
  listo()
  const f = uno(await supabase.from('hoy_eod').select('*').eq('fecha', fecha).maybeSingle(), 'no se pudo leer el EOD')
  return f ? aEod(f) : { fecha, respuestas: {}, cerradoEn: null }
}

/** Guarda respuestas y/o el cerrado (`{ respuestas, cerradoEn }`); la fila nace aquí si no estaba. */
export async function guardarEod(fecha, cambios = {}) {
  listo()
  const { data: { user } = {} } = await supabase.auth.getUser()
  const fila = { owner_id: user?.id, fecha, updated_at: new Date().toISOString() }
  if ('respuestas' in cambios) fila.respuestas = cambios.respuestas || {}
  if ('cerradoEn' in cambios) fila.cerrado_en = cambios.cerradoEn
  const r = await supabase.from('hoy_eod').upsert(fila, { onConflict: 'owner_id,fecha' }).select().single()
  return aEod(uno(r, 'no se pudo guardar el EOD'))
}

/* ── puras ─────────────────────────────────────────────────────────────────── */

/** Lo cerrado en el día lógico `hoy`, lo último arriba. Tareas de 2day y del portal. */
export const completadasDelDia = (tareas, hoy) => tareas
  .filter((t) => t.hecha && diaDe(t.hechaEn) === hoy)
  .sort((a, b) => ((a.hechaEn || '') < (b.hechaEn || '') ? 1 : -1))

/** Lo creado en el día lógico `hoy` (vivo o hecho; lo archivado no), lo último arriba. */
export const creadasDelDia = (tareas, hoy) => tareas
  .filter((t) => !t.archivadoEn && diaDe(t.creadaEn) === hoy)
  .sort((a, b) => ((a.creadaEn || '') < (b.creadaEn || '') ? 1 : -1))

/** El hábito que el EOD apunta, por nombre (los crea el protocolo y la migración §16). */
export const habitoEod = (habitos, cual) => {
  const nombres = { sueno: /sueño/i, peso: /^peso$/i, dientes: /dientes/i }
  return habitos.find((h) => nombres[cual].test(h.nombre)) || null
}
