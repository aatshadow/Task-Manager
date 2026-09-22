/**
 * habitos.js — hábitos y marcas.
 *
 * Cadencia: `diario` (toca todos los días) · `dias` (toca los días ISO de `dias`, 1=L…7=D)
 * · `semana` (X veces por semana, el día da igual). Un hábito NO se borra: se archiva. Y un
 * día que no tocaba NO es un fallo (LOGICA §3.6): la racha sólo cuenta días que tocaban.
 *
 * Desde el Protocolo (§10.2) un hábito lleva además `hora`, `grupo`, `tipo`
 * (`hacer` · `evitar` · `medir`), `unidad`/`objetivo` (los que se miden), `bloqueId` (de
 * qué bloque del día cuelga), `descripcion` y `plan` (por día ISO, el entreno). Una
 * marca puede llevar `valor` (kg, horas) y `nota` (pesos, rondas).
 */
import { supabase, isConfigured, ErrorHoy, filas, uno, ok } from '../lib/supabase.js'
import { aISO, sumarDias, diaSemanaISO, lunesDe, semanaDe, horaCorta, aMinutos, rangoDias } from './fechas.js'
import { bloquesDelDia } from './bloques.js'

export const TIPOS = [
  { clave: 'hacer', nombre: 'Hacer' },
  { clave: 'evitar', nombre: 'Evitar' },
  { clave: 'medir', nombre: 'Medir' },
]
export const GRUPOS = ['Calibración', 'Cuerpo', 'Nutrición', 'Trabajo', 'Apagado']

const listo = () => {
  if (!isConfigured || !supabase) throw new ErrorHoy('Supabase no está configurado')
}

const aHabito = (h) => ({
  id: h.id, nombre: h.nombre, icono: h.icono || '', color: h.color,
  cadencia: h.cadencia || 'diario', dias: (h.dias || []).map(Number), vecesSemana: h.veces_semana || 1,
  posicion: h.posicion, archivadoEn: h.archivado_at, creadoEn: h.created_at,
  hora: horaCorta(h.hora), grupo: h.grupo || '', tipo: h.tipo || 'hacer',
  unidad: h.unidad || '', objetivo: h.objetivo == null ? null : Number(h.objetivo),
  bloqueId: h.bloque_id || null, plan: h.plan && typeof h.plan === 'object' ? h.plan : {},
  descripcion: h.descripcion || '',
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
  if ('hora' in c) m.hora = c.hora || null
  if ('grupo' in c) m.grupo = c.grupo || ''
  if ('tipo' in c) m.tipo = TIPOS.some((t) => t.clave === c.tipo) ? c.tipo : 'hacer'
  if ('unidad' in c) m.unidad = c.unidad || ''
  if ('objetivo' in c) m.objetivo = c.objetivo === '' || c.objetivo == null ? null : Number(c.objetivo)
  if ('bloqueId' in c) m.bloque_id = c.bloqueId || null
  if ('plan' in c) m.plan = c.plan && typeof c.plan === 'object' ? c.plan : {}
  if ('descripcion' in c) m.descripcion = c.descripcion || ''
  return m
}

export async function cargarHabitos({ incluirArchivados = false } = {}) {
  listo()
  let q = supabase.from('hoy_habitos').select('*').order('posicion').order('created_at')
  if (!incluirArchivados) q = q.is('archivado_at', null)
  return filas(await q, 'no se pudieron leer los hábitos').map(aHabito)
}

export async function crearHabito({ nombre, icono, color, cadencia = 'diario', dias = [], vecesSemana = 1, posicion,
  hora = null, grupo = '', tipo = 'hacer', unidad = '', objetivo = null, bloqueId = null, plan = {}, descripcion = '' }) {
  listo()
  const fila = aColumnasHabito({ nombre, icono, color: color || '#ff6a1a', cadencia, dias, vecesSemana, hora, grupo, tipo, unidad, objetivo, bloqueId, plan, descripcion })
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

const aMarca = (m) => ({ habitoId: m.habito_id, fecha: m.fecha, nota: m.nota || '', valor: m.valor == null ? null : Number(m.valor), marcadoEn: m.marcado_en })

export async function cargarMarcas(desde, hasta) {
  listo()
  let q = supabase.from('hoy_marcas').select('*').order('fecha')
  if (desde) q = q.gte('fecha', desde)
  if (hasta) q = q.lte('fecha', hasta)
  return filas(await q, 'no se pudieron leer las marcas').map(aMarca)
}

/**
 * Marca (o desmarca) un hábito en una fecha. Una marca por (hábito, fecha). `extra` admite
 * `{ nota, valor }` (o, por compatibilidad, una nota en texto). Un `medir` se marca
 * escribiendo el valor; sin valor no hay marca.
 */
export async function marcar(habitoId, fecha, si = true, extra = '') {
  listo()
  if (!habitoId || !fecha) throw new ErrorHoy('falta el hábito o la fecha')
  if (!si) {
    ok(await supabase.from('hoy_marcas').delete().eq('habito_id', habitoId).eq('fecha', fecha), 'no se pudo desmarcar')
    return null
  }
  const { nota = '', valor = null } = typeof extra === 'string' ? { nota: extra } : (extra || {})
  const fila = { habito_id: habitoId, fecha, nota: nota || '' }
  if (valor !== undefined) fila.valor = valor === '' || valor == null ? null : Number(valor)
  const r = await supabase.from('hoy_marcas').upsert(fila, { onConflict: 'habito_id,fecha' }).select().single()
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

/* ── el Protocolo (LOGICA §10) ───────────────────────────────────────────────── */

const marcaDe = (h, marcas, fecha) => (marcas || []).find((m) => m.habitoId === h.id && m.fecha === fecha) || null
const existiaEn = (h, fecha) => {
  if (h.archivadoEn && aISO(new Date(h.archivadoEn)) <= fecha) return false
  if (h.creadoEn && aISO(new Date(h.creadoEn)) > fecha) return false
  return true
}

/**
 * ¿Cuenta como hecho? `hacer`/`evitar`: hay marca. `medir`: hay marca con valor.
 * (Misma fórmula que `hoy_adherencia_dia`, que no distingue tipos porque una marca de
 * un `medir` sólo nace con valor.)
 */
export function estaHecho(h, marcas, fecha) {
  const m = marcaDe(h, marcas, fecha)
  if (!m) return false
  return h.tipo === 'medir' ? m.valor != null : true
}

/**
 * Adherencia del día: `{ tocaban, hechos, porcentaje }`. Sólo cuentan los hábitos vivos
 * ese día que tocaban; un `semana` («3 veces por semana») sólo cuenta si se marcó
 * (§10.0-16: no puede penalizar cada día). `evitar` cuenta igual que `hacer`.
 */
export function adherencia(habitos, marcas, fecha) {
  let tocaban = 0
  let hechos = 0
  for (const h of habitos || []) {
    if (!existiaEn(h, fecha)) continue
    const hecho = estaHecho(h, marcas, fecha)
    const toca = h.cadencia === 'semana' ? hecho : tocaHoy(h, fecha)
    if (!toca) continue
    tocaban += 1
    if (hecho) hechos += 1
  }
  return { tocaban, hechos, porcentaje: tocaban ? Math.round((hechos / tocaban) * 100) : 0 }
}

/** Un día perfecto: tocaba algo y se hizo todo. */
export function diaPerfecto(habitos, marcas, fecha) {
  const a = adherencia(habitos, marcas, fecha)
  return a.tocaban > 0 && a.hechos === a.tocaban
}

/**
 * Racha de días perfectos hacia atrás desde `hoy` (hoy sin cerrar no rompe: si hoy no es
 * perfecto aún, se empieza a contar desde ayer). No baja de `desde` (el inicio del reto).
 * Un día en que no tocaba nada no rompe ni suma.
 */
export function rachaPerfectos(habitos, marcas, hoy, desde = null) {
  let dia = aISO(hoy)
  let n = 0
  if (!diaPerfecto(habitos, marcas, dia)) dia = sumarDias(dia, -1)
  for (let i = 0; i < 3660; i += 1) {
    if (desde && dia < desde) break
    const a = adherencia(habitos, marcas, dia)
    if (a.tocaban === 0) { dia = sumarDias(dia, -1); continue }
    if (a.hechos < a.tocaban) break
    n += 1
    dia = sumarDias(dia, -1)
  }
  return n
}

/** El plan de hoy (`{ titulo, lineas }`) de un hábito con `plan` por día ISO, o null. */
export function planDeHoy(h, fecha) {
  const p = h?.plan?.[String(diaSemanaISO(fecha))]
  if (!p) return null
  return { titulo: p.titulo || '', lineas: Array.isArray(p.lineas) ? p.lineas : [] }
}

/** Nivel 0–4 de adherencia para el mapa de calor (0 = nada o no tocaba). */
export function nivelAdherencia({ tocaban, hechos }) {
  if (!tocaban || !hechos) return 0
  const p = hechos / tocaban
  if (p >= 1) return 4
  if (p >= 0.75) return 3
  if (p >= 0.5) return 2
  return 1
}

/**
 * Los hábitos que tocan en `fecha` agrupados por bloque del día, en el orden del raíl:
 * `[{ bloque, habitos }]`. Los que no cuelgan de ningún bloque (o de uno que hoy no
 * toca) van al final bajo `bloque: null`. Dentro de cada grupo, por hora y posición.
 */
export function agruparPorBloque(habitos, bloques, fecha) {
  const delDia = bloquesDelDia(bloques, fecha)
  const porHora = (a, b) => (aMinutos(a.hora || '00:00') - aMinutos(b.hora || '00:00')) || ((a.posicion ?? 0) - (b.posicion ?? 0))
  const tocan = (habitos || []).filter((h) => !h.archivadoEn && tocaHoy(h, fecha)).sort(porHora)
  const grupos = delDia.map((bloque) => ({ bloque, habitos: tocan.filter((h) => h.bloqueId === bloque.id) }))
  const conBloque = new Set(delDia.map((b) => b.id))
  const sueltos = tocan.filter((h) => !h.bloqueId || !conBloque.has(h.bloqueId))
  const out = grupos.filter((g) => g.habitos.length)
  if (sueltos.length) out.push({ bloque: null, habitos: sueltos })
  return out
}

/** Serie de un `medir`: `[{ fecha, valor }]` por día con marca en `[desde, hasta]`. */
export function serieMedida(h, marcas, desde, hasta) {
  return rangoDias(desde, hasta)
    .map((fecha) => ({ fecha, valor: marcaDe(h, marcas, fecha)?.valor ?? null }))
    .filter((p) => p.valor != null)
}
