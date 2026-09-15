/**
 * calculos.js — lo PURO de la pantalla Stats: rangos, agregados y escalas.
 * Nada de Supabase ni de React aquí: todo se puede probar con arrays.
 * Lo que es genérico (series, por proyecto…) ya vive en `datos/estadisticas.js`;
 * aquí solo va lo que necesita esta pantalla para pintar.
 */
import { sumarDias, semanaDe, lunesDe, diaDe, rangoDias, textoFecha, nombreDia } from '../../datos/fechas.js'
import { cumplimientoSemana, tocaHoy } from '../../datos/habitos.js'

/** Los tres rangos del selector (LOGICA.md §5: 7 · 30 · 90). */
export const RANGOS = [
  { valor: 7, etiqueta: '7 días' },
  { valor: 30, etiqueta: '30 días' },
  { valor: 90, etiqueta: '90 días' },
]

/**
 * `{ desde, hasta, n, desdeCarga }`: los últimos `n` días terminando en `hoy` (hoy incluido).
 * `desdeCarga` es el lunes de `desde`: la sobrecarga a 90 días se agrupa por semanas y una
 * semana de 4 días comparada con una de 7 engaña, así que los días se piden desde el lunes
 * para que todas las semanas cerradas vengan completas. A 7 y 30 coincide con `desde`.
 */
export function rangoDe(hoy, n) {
  const desde = sumarDias(hoy, -(n - 1))
  return { desde, hasta: hoy, n, desdeCarga: n > 30 ? lunesDe(desde) : desde }
}

/**
 * El hueco de hoy en vivo: hoy nunca tiene fila en `hoy_dias` (se cierra al reiniciar), y
 * sin esto la última columna diría 0/0 aunque haya tareas planificadas. Cuenta lo mismo que
 * la RPC `hoy_reiniciar_dia`: capas con `hoy_para = hoy`, hechas las que están hechas.
 * `tareas` debe incluir archivadas (la RPC no las excluye).
 */
export function diaEnCurso(tareas, hoy) {
  const deHoy = (tareas || []).filter((t) => t.hoyPara === hoy)
  return { fecha: hoy, planificadas: deHoy.length, hechas: deHoy.filter((t) => t.hecha).length, enCurso: true }
}

/**
 * La sobrecarga del rango en un número: Σ hechas / Σ planificadas de `hoy_dias`.
 * `pct` es null cuando no hay ningún día cerrado con planificadas: no hay nada que dividir.
 */
export function totalSobrecarga(dias) {
  let planificadas = 0
  let hechas = 0
  for (const d of dias || []) { planificadas += d.planificadas || 0; hechas += d.hechas || 0 }
  return { planificadas, hechas, pct: planificadas > 0 ? Math.round((hechas / planificadas) * 100) : null }
}

/**
 * Sobrecarga día a día SIN huecos entre `desde` y `hasta`: un día sin fila en `hoy_dias`
 * es un día sin planificar (0/0), y aun así ocupa su hueco para que el eje sea uniforme.
 */
export function sobrecargaSinHuecos(dias, desde, hasta) {
  const m = new Map((dias || []).map((d) => [d.fecha, d]))
  return rangoDias(desde, hasta).map((fecha) => {
    const d = m.get(fecha)
    return { fecha, planificadas: d?.planificadas || 0, hechas: d?.hechas || 0, enCurso: !!d?.enCurso }
  })
}

/**
 * Agrupa la sobrecarga por semanas (lunes a domingo). A 90 días caben 13 pares de barras
 * en 310px; 90 pares no se leen. La semana que contiene un día `enCurso` (la de hoy) sale
 * marcada `enCurso` para que el tooltip avise de que aún no está cerrada.
 */
export function sobrecargaPorSemana(diasSinHuecos) {
  const m = new Map()
  for (const d of diasSinHuecos || []) {
    const lunes = lunesDe(d.fecha)
    if (!m.has(lunes)) m.set(lunes, { fecha: lunes, planificadas: 0, hechas: 0, enCurso: false })
    const s = m.get(lunes)
    s.planificadas += d.planificadas
    s.hechas += d.hechas
    if (d.enCurso) s.enCurso = true
  }
  return [...m.values()]
}

/**
 * Cumplimiento de hábitos por semana, las últimas `semanas` terminando en la de `hoy`.
 * Suma hechas/objetivo de todos los hábitos vivos que YA existían esa semana: un hábito
 * creado hace dos semanas no puede hundir las seis anteriores. `pct` null si no había
 * ningún hábito. `hechas` se recorta al objetivo (con cadencia `semana` se puede marcar
 * más veces de las pedidas) para que el porcentaje nunca pase de 100.
 *
 * Con cadencia diario/dias el objetivo solo cuenta los días que ya han pasado (≤ hoy) y en
 * los que el hábito existía: un lunes con todo hecho es 100 %, no 14 %, y un hábito creado
 * el jueves no arranca con cuatro fallos. Con cadencia `semana` el objetivo es el de la
 * semana entera (las N veces se pueden hacer cualquier día, así que no hay días «perdidos»).
 */
export function cumplimientoPorSemana(habitos, marcas, hoy, semanas = 8) {
  const lunesHoy = lunesDe(hoy)
  const salida = []
  for (let i = semanas - 1; i >= 0; i -= 1) {
    const lunes = sumarDias(lunesHoy, -7 * i)
    const semana = semanaDe(lunes)
    const domingo = semana[6]
    let hechas = 0
    let objetivo = 0
    for (const h of habitos || []) {
      const nacio = h.creadoEn ? diaDe(h.creadoEn) : null
      const murio = h.archivadoEn ? diaDe(h.archivadoEn) : null
      if (nacio && nacio > domingo) continue
      if (murio && murio < lunes) continue
      // los días de la semana en los que el hábito estaba vivo y que ya han pasado
      const diasVivos = semana.filter((d) => d <= hoy && (!nacio || d >= nacio) && (!murio || d <= murio))
      const c = cumplimientoSemana(h, marcas, diasVivos)
      const obj = h.cadencia === 'semana' ? c.objetivo : diasVivos.filter((d) => tocaHoy(h, d)).length
      objetivo += obj
      hechas += Math.min(c.hechas, obj)
    }
    salida.push({
      fecha: lunes,
      etiqueta: textoFecha(lunes),
      hechas,
      objetivo,
      pct: objetivo > 0 ? Math.round((hechas / objetivo) * 100) : null,
      actual: i === 0,
    })
  }
  return salida
}

/**
 * Los `maximo` primeros y el resto plegado en «Otros» (dataviz: nunca más de ~7 clases
 * con significado; el rabo se pliega, no se le inventan colores).
 */
export function plegarOtros(filas, maximo = 7) {
  if (!filas || filas.length <= maximo) return filas || []
  const cabeza = filas.slice(0, maximo - 1)
  const resto = filas.slice(maximo - 1)
  return [...cabeza, { clave: 'otros', nombre: 'Otros', n: resto.reduce((s, f) => s + f.n, 0), plegado: true }]
}

/**
 * Techo «limpio» de un eje y sus marcas: para un máximo de 7 devuelve 8 con 0·4·8;
 * para 23 devuelve 25 con 0·5·10·15·20·25 recortado a `n` marcas. Con todo a cero, techo 4
 * para que las líneas no se peguen al suelo.
 */
export function ejeLimpio(maximo, n = 3) {
  const m = Math.max(0, maximo || 0)
  // son conteos: por debajo de 4 el eje 0·2·4 es más honesto que marcas con decimales
  if (m <= 4) return { techo: 4, marcas: [0, 2, 4] }
  const brutos = m / n
  const pot = Math.pow(10, Math.floor(Math.log10(brutos)))
  const candidatos = [1, 2, 5, 10].map((k) => Math.max(1, k * pot))
  const paso = candidatos.find((p) => p >= brutos) || candidatos[candidatos.length - 1]
  const techo = Math.ceil(m / paso) * paso
  const marcas = []
  for (let v = 0; v <= techo; v += paso) marcas.push(v)
  return { techo, marcas }
}

/**
 * Qué índices del eje X llevan etiqueta: a 7 días todos; a más, exactamente `deseadas`
 * repartidas a partes iguales, con el primero y el último siempre dentro (el paso va en
 * coma flotante y se redondea por índice: con paso entero a 30 días se perdía el primer
 * día y salían cuatro etiquetas en vez de cinco). Devuelve un Set de índices.
 */
export function indicesEtiquetaX(n, deseadas = 5) {
  if (n <= 8) return new Set(Array.from({ length: n }, (_, i) => i))
  const paso = (n - 1) / (deseadas - 1)
  const s = new Set()
  for (let i = 0; i < deseadas; i += 1) s.add(Math.round(i * paso))
  return s
}

/** Texto corto de un día para el eje X: «L» a 7 días, «16 sep» a más. */
export function etiquetaDia(iso, n) {
  return n <= 8 ? nombreDia(iso, true) : textoFecha(iso)
}

/**
 * Trazo suave monótono (Fritsch-Carlson, el `curveMonotoneX` de d3): pasa por todos
 * los puntos sin rebasar por debajo de cero ni inventar picos entre dos días iguales,
 * cosa que una Catmull-Rom sí hace con datos de conteo.
 */
export function trazoMonotono(puntos) {
  const n = puntos.length
  if (n === 0) return ''
  if (n === 1) return `M${puntos[0][0]},${puntos[0][1]}`
  const dx = []
  const dy = []
  const m = []
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(puntos[i + 1][0] - puntos[i][0])
    dy.push(puntos[i + 1][1] - puntos[i][1])
    m.push(dx[i] === 0 ? 0 : dy[i] / dx[i])
  }
  const t = [m[0]]
  for (let i = 1; i < n - 1; i += 1) {
    if (m[i - 1] * m[i] <= 0) t.push(0)
    else t.push((m[i - 1] + m[i]) / 2)
  }
  t.push(m[n - 2])
  // limita las tangentes para que la curva no rebase los datos
  for (let i = 0; i < n - 1; i += 1) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue }
    const a = t[i] / m[i]
    const b = t[i + 1] / m[i]
    const s = a * a + b * b
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i] }
  }
  let d = `M${r(puntos[0][0])},${r(puntos[0][1])}`
  for (let i = 0; i < n - 1; i += 1) {
    const [x0, y0] = puntos[i]
    const [x1, y1] = puntos[i + 1]
    const h = dx[i] / 3
    d += ` C${r(x0 + h)},${r(y0 + t[i] * h)} ${r(x1 - h)},${r(y1 - t[i + 1] * h)} ${r(x1)},${r(y1)}`
  }
  return d
}

const r = (v) => Math.round(v * 100) / 100

/** Número legible en español: 1284 → «1.284»; decimales con coma. */
export function num(v, decimales = 0) {
  if (v == null || Number.isNaN(v)) return '—'
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(v)
}
