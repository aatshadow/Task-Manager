/**
 * fechas.js — todo lo que toca un día, en LOCAL.
 *
 * ⚠️ POR QUÉ NADA DE `toISOString()`. Devuelve UTC, y el Mac de Alex va en hora de
 * Sofía (UTC+3): a las 01:00 del día 16, `toISOString()` dice día 15. Un «hoy» que
 * cambia según el huso no es un hoy. Aquí un día es un texto `YYYY-MM-DD` construido
 * con getFullYear/getMonth/getDate, y se compara como texto (ordena bien).
 *
 * Convención: las funciones aceptan un ISO (`'2026-09-16'`) o un `Date` y devuelven ISO
 * salvo que se diga lo contrario.
 */

const dos = (n) => String(n).padStart(2, '0')

/** `Date` → `'YYYY-MM-DD'` en local. */
export function aISO(date) {
  const d = date instanceof Date ? date : deISO(date)
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
}

/** `'YYYY-MM-DD'` → `Date` a medianoche local. Un `Date` pasa tal cual. */
export function deISO(iso) {
  if (iso instanceof Date) return new Date(iso.getFullYear(), iso.getMonth(), iso.getDate())
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return new Date(a, m - 1, d)
}

/** ¿Tiene forma de día? */
export const esISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))

/** `'04:00'` o `'04:00:00'` → minutos desde medianoche. */
export function aMinutos(hora) {
  if (!hora) return 0
  const [h, m] = String(hora).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Minutos desde medianoche → `'HH:MM'`. */
export function deMinutos(min) {
  const n = Math.max(0, Math.round(min))
  return `${dos(Math.floor(n / 60) % 24)}:${dos(n % 60)}`
}

/** `'04:00:00'` (como lo devuelve un `time` de Postgres) → `'04:00'`. */
export function horaCorta(hora) {
  return hora ? String(hora).slice(0, 5) : null
}

/**
 * El «hoy» de la app. A las 02:00 con reinicio a las 04:00 sigue siendo AYER: el día
 * no cambia a medianoche sino a la hora de reinicio (LOGICA §3). `ahora` se inyecta
 * para poder probarlo.
 */
// La hora de reinicio del día es UNA para toda la app: la fija el proveedor al cargar los
// ajustes y la heredan `hoyLocal` y `diaDe`. Si cada llamada la pasara a mano, un sitio
// acabaría contando con las 04:00 y otro con medianoche (medido el 16-09: Stats decía
// «ni creadas ni hechas» con 7 tareas creadas a la 01:50, porque las ponía en el día 16
// mientras «hoy» seguía siendo el 15).
let reinicioPorDefecto = '04:00'
export function configurarReinicio(hora) { if (hora) reinicioPorDefecto = hora }

export function hoyLocal(horaReinicio = reinicioPorDefecto, ahora = new Date()) {
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes()
  const d = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
  if (minutosAhora < aMinutos(horaReinicio)) d.setDate(d.getDate() - 1)
  return aISO(d)
}

/** `'HH:MM'` de ahora mismo, en local. */
export function horaAhora(ahora = new Date()) {
  return `${dos(ahora.getHours())}:${dos(ahora.getMinutes())}`
}

export function sumarDias(iso, n) {
  const d = deISO(iso)
  d.setDate(d.getDate() + n)
  return aISO(d)
}

/**
 * Días enteros de `a` a `b` (positivo si `b` es después). Ignora la hora.
 * Un timestamp (`created_at`, `updated_at`…) se pasa por `diaDe`: recortar sus 10 primeros
 * caracteres daría el día UTC, y con el reloj en UTC+3 una tarea capturada a la 01:30 saldría
 * como «hace 1 día» en vez de «hoy».
 */
export function diasEntre(a, b) {
  const da = deISO(a instanceof Date ? a : aDia(a))
  const db = deISO(b instanceof Date ? b : aDia(b))
  // Se redondea porque un cambio de hora (DST) deja días de 23 o 25 horas.
  return Math.round((db - da) / 86400000)
}

/** Día de la semana ISO: 1 = lunes … 7 = domingo. */
export function diaSemanaISO(iso) {
  const g = deISO(iso).getDay()
  return g === 0 ? 7 : g
}

/** El lunes de la semana de `fecha`. */
export function lunesDe(fecha) {
  return sumarDias(aISO(fecha), 1 - diaSemanaISO(fecha))
}

/** Los 7 días de la semana de `fecha`: `[lunes … domingo]`. */
export function semanaDe(fecha) {
  const lunes = lunesDe(fecha)
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))
}

/**
 * El mes de `fecha`, listo para pintar la rejilla: `{ anio, mes (1..12), primero, ultimo,
 * dias: [iso…], semanas: [[7 iso]…] }`. Las semanas empiezan en lunes y rellenan con los
 * días del mes anterior/siguiente, que es lo que espera una rejilla de calendario.
 */
export function mesDe(fecha) {
  const d = deISO(fecha)
  const anio = d.getFullYear()
  const mes = d.getMonth() + 1
  const primero = `${anio}-${dos(mes)}-01`
  const ultimo = aISO(new Date(anio, mes, 0))
  const nDias = new Date(anio, mes, 0).getDate()
  const dias = Array.from({ length: nDias }, (_, i) => `${anio}-${dos(mes)}-${dos(i + 1)}`)
  const semanas = []
  let cursor = lunesDe(primero)
  while (cursor <= ultimo) {
    semanas.push(Array.from({ length: 7 }, (_, i) => sumarDias(cursor, i)))
    cursor = sumarDias(cursor, 7)
  }
  return { anio, mes, primero, ultimo, dias, semanas }
}

/** Mismo mes que `fecha`, `n` meses después (negativo = antes). Día 1. */
export function sumarMeses(fecha, n) {
  const d = deISO(fecha)
  return aISO(new Date(d.getFullYear(), d.getMonth() + n, 1))
}

const DIAS_LARGO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const DIAS_CORTO = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre']

/** `'lunes'` o, en corto, `'L'`. */
export function nombreDia(iso, corto = false) {
  const i = diaSemanaISO(iso) - 1
  return corto ? DIAS_CORTO[i] : DIAS_LARGO[i]
}

/** `'septiembre'`. Acepta ISO o número de mes 1..12. */
export function nombreMes(fechaOMes) {
  const n = typeof fechaOMes === 'number' ? fechaOMes : deISO(fechaOMes).getMonth() + 1
  return MESES[n - 1]
}

/** `'16 sep'` o `'martes 16 de septiembre'`. */
export function textoFecha(iso, largo = false) {
  if (!iso) return ''
  const d = deISO(iso)
  const mes = nombreMes(iso)
  return largo
    ? `${nombreDia(iso)} ${d.getDate()} de ${mes}`
    : `${d.getDate()} ${mes.slice(0, 3)}`
}

/** El día local de un timestamp (`created_at`, `hecha_en`…). `null` si no hay. */
export function diaDe(timestamp, horaReinicio = reinicioPorDefecto) {
  if (!timestamp) return null
  // El día LÓGICO del instante: a la 01:50 del 16 con reinicio a las 04:00 sigue siendo el 15,
  // igual que lo es para `hoyLocal`. Así «hechas hoy», la serie de Stats y «hace N días»
  // cuentan con el mismo calendario que la pantalla Hoy.
  return hoyLocal(horaReinicio, new Date(timestamp))
}

// ISO tal cual; si trae hora (hay una `T`), el día LOCAL que le corresponde.
const aDia = (v) => (String(v).includes('T') ? diaDe(v) : String(v).slice(0, 10))

/** Lista de días `desde..hasta`, ambos incluidos, sin huecos. */
export function rangoDias(desde, hasta) {
  const out = []
  let c = aISO(desde)
  const fin = aISO(hasta)
  while (c <= fin) { out.push(c); c = sumarDias(c, 1) }
  return out
}
