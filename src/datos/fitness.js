/**
 * fitness.js — sesiones por día y medidas (LOGICA §11).
 *
 * Una sesión es de una FECHA (no de un día de la semana, como el plan del hábito
 * Entreno): título, `lineas` (los ejercicios del día) y `pruebas` (lo que se mide). Las
 * sesiones las escribe CORE por SQL; aquí sólo se leen, se les pone nota y se apuntan
 * las medidas.
 *
 * Una medida es (fecha, clave) → valor, en la unidad de la prueba. Los tiempos se
 * guardan en SEGUNDOS y se escriben y se leen como `mm:ss`.
 */
import { supabase, isConfigured, ErrorHoy, filas, uno, ok } from '../lib/supabase.js'

const listo = () => {
  if (!isConfigured || !supabase) throw new ErrorHoy('Supabase no está configurado')
}

const aPrueba = (p) => ({
  clave: String(p?.clave || ''), nombre: p?.nombre || '', unidad: p?.unidad || '',
  formato: p?.formato === 'tiempo' ? 'tiempo' : 'numero', ref: p?.ref || '', opcional: !!p?.opcional,
})
const aSesion = (s) => ({
  id: s.id, fecha: s.fecha, titulo: s.titulo || '',
  lineas: Array.isArray(s.lineas) ? s.lineas.map(String) : [],
  pruebas: (Array.isArray(s.pruebas) ? s.pruebas : []).map(aPrueba).filter((p) => p.clave),
  nota: s.nota || '',
})
const aMedida = (m) => ({ fecha: m.fecha, clave: m.clave, valor: Number(m.valor), marcadoEn: m.marcado_en })

export async function cargarSesiones() {
  listo()
  return filas(await supabase.from('hoy_fit_sesiones').select('*').order('fecha'), 'no se pudieron leer las sesiones').map(aSesion)
}

export async function cargarMedidas() {
  listo()
  return filas(await supabase.from('hoy_fit_marcas').select('*').order('fecha'), 'no se pudieron leer las medidas').map(aMedida)
}

/** Apunta (o, con `valor` null, borra) la medida de una prueba en una fecha. */
export async function medir(fecha, clave, valor) {
  listo()
  if (!fecha || !clave) throw new ErrorHoy('falta la fecha o la prueba')
  if (valor == null || valor === '') {
    ok(await supabase.from('hoy_fit_marcas').delete().eq('fecha', fecha).eq('clave', clave), 'no se pudo borrar la medida')
    return null
  }
  const n = Number(valor)
  if (!Number.isFinite(n)) throw new ErrorHoy('la medida tiene que ser un número')
  const r = await supabase.from('hoy_fit_marcas')
    .upsert({ fecha, clave, valor: n, marcado_en: new Date().toISOString() }, { onConflict: 'owner_id,fecha,clave' })
    .select().single()
  return aMedida(uno(r, 'no se pudo guardar la medida'))
}

export async function anotarSesion(id, nota) {
  listo()
  const r = await supabase.from('hoy_fit_sesiones').update({ nota: String(nota || '').trim() }).eq('id', id).select().single()
  return aSesion(uno(r, 'no se pudo guardar la nota'))
}

/* ── puras ─────────────────────────────────────────────────────────────────── */

/** La sesión de una fecha, o null. */
export const sesionDe = (sesiones, fecha) => (sesiones || []).find((s) => s.fecha === fecha) || null

/** Las medidas de una fecha como `{ clave: valor }`. */
export function medidasDe(medidas, fecha) {
  const out = {}
  for (const m of medidas || []) if (m.fecha === fecha) out[m.clave] = m.valor
  return out
}

/** Cuántas pruebas de la sesión tienen medida. Las opcionales sólo cuentan si se han puesto. */
export function progreso(sesion, medidas) {
  const puestas = medidasDe(medidas, sesion?.fecha)
  const pruebas = sesion?.pruebas || []
  const hechas = pruebas.filter((p) => p.clave in puestas).length
  const total = pruebas.filter((p) => !p.opcional || p.clave in puestas).length
  return { hechas, total }
}

/** `'12:30'` → 750 · `'1:02:30'` → 3750 · `'45'` → 45 (segundos). Vacío → null; mal escrito → NaN. */
export function aSegundos(texto) {
  const t = String(texto ?? '').trim().replace(',', '.')
  if (!t) return null
  const partes = t.split(':').map((x) => x.trim())
  if (partes.length > 3 || partes.some((x) => x === '' || !/^\d+(\.\d+)?$/.test(x))) return NaN
  return partes.reduce((acc, x) => acc * 60 + Number(x), 0)
}

/** 750 → `'12:30'` · 3750 → `'1:02:30'`. */
export function deSegundos(seg) {
  if (seg == null || !Number.isFinite(Number(seg))) return ''
  const n = Math.round(Number(seg))
  const h = Math.floor(n / 3600)
  const m = Math.floor((n % 3600) / 60)
  const s = String(n % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** Lo escrito en el campo → el número que se guarda. Vacío → null; mal escrito → NaN. */
export function valorDeTexto(prueba, texto) {
  if (prueba?.formato === 'tiempo') return aSegundos(texto)
  const t = String(texto ?? '').trim().replace(',', '.')
  if (!t) return null
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN
}

/** El número guardado → lo que enseña el campo. */
export function textoDeValor(prueba, valor) {
  if (valor == null) return ''
  return prueba?.formato === 'tiempo' ? deSegundos(valor) : String(valor).replace('.', ',')
}

/* ── ficha de combate (LOGICA §12) ─────────────────────────────────────────── */

const aFicha = (f) => ({ id: f.id, fecha: f.fecha, version: f.version || '', datos: f.datos && typeof f.datos === 'object' ? f.datos : {} })

/** Las versiones de la ficha, de la más antigua a la más nueva. */
export async function cargarFichas() {
  listo()
  return filas(await supabase.from('hoy_fit_fichas').select('*').order('fecha').order('created_at'), 'no se pudo leer la ficha').map(aFicha)
}

/** La última versión (la que se enseña) y la primera (el fantasma del punto de partida). */
export const fichaActual = (fichas) => (fichas?.length ? fichas[fichas.length - 1] : null)
export const fichaInicial = (fichas) => (fichas?.length > 1 ? fichas[0] : null)

/**
 * El dato vivo de un campo de la ficha: `peso` → la última marca del hábito «Peso»;
 * `habito:<nombre>` → la última marca con valor de ese hábito; cualquier otra clave → la
 * última medida de Fitness con esa clave. `{ valor, fecha }` o null.
 */
export function vivoDe(clave, { marcas = [], habitos = [], medidas = [] } = {}) {
  if (!clave) return null
  const nombreHabito = clave === 'peso' ? 'peso' : clave.startsWith('habito:') ? clave.slice(7) : null
  let filasVivas
  if (nombreHabito) {
    const h = habitos.find((x) => x.nombre.trim().toLowerCase() === nombreHabito.trim().toLowerCase())
    if (!h) return null
    filasVivas = marcas.filter((m) => m.habitoId === h.id && m.valor != null)
  } else {
    filasVivas = medidas.filter((m) => m.clave === clave)
  }
  const ultima = filasVivas.reduce((a, m) => (!a || m.fecha > a.fecha ? m : a), null)
  return ultima ? { valor: ultima.valor, fecha: ultima.fecha } : null
}

/** La última medida de una clave (para desbloquear una casilla de la ficha), o null. */
export const ultimaMedida = (medidas, clave) => vivoDe(clave, { medidas })

/** Cuántas casillas de un dominio están ya desbloqueadas (hay medida con su clave). */
export function exploracion(dominio, medidas) {
  const casillas = dominio?.bloqueado || []
  const abiertas = casillas.filter((b) => (medidas || []).some((m) => m.clave === b.clave)).length
  return { abiertas, total: casillas.length }
}
