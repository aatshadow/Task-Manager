/**
 * overview.js — el Overview (LOGICA §13): las métricas de todo 2day y la ficha IA.
 *
 * Dos capas. Las MÉTRICAS son puras y deterministas (se calculan aquí, en el navegador,
 * con lo que la RLS ya deja ver): días con movimiento, rachas, creadas/hechas, dónde va el
 * tiempo planificado, hábitos, hitos. La FICHA la escribe Claude a partir de esas métricas
 * (`/api/overview`) y se guarda por versiones en `hoy_overview`: regenerar = otra fila, así
 * se ve la evolución. Todo cuenta desde `ajustes.statsDesde` (§5.3) si lo hay.
 */
import { supabase, isConfigured, ErrorHoy, filas, uno } from '../lib/supabase.js'
import { aMinutos, diaDe, diaSemanaISO, diasEntre, rangoDias, sumarDias } from './fechas.js'
import { adherencia, diaPerfecto } from './habitos.js'
import { diaDelReto } from './retos.js'

const listo = () => {
  if (!isConfigured || !supabase) throw new ErrorHoy('Supabase no está configurado')
}

const aVersion = (f) => ({
  id: f.id, creadaEn: f.created_at, desde: f.desde, hasta: f.hasta,
  modelo: f.modelo, metricas: f.metricas || {}, ficha: f.ficha || {},
})

/** Todas las versiones, la más reciente primero. */
export async function cargarVersiones() {
  listo()
  return filas(await supabase.from('hoy_overview').select('*').order('created_at', { ascending: false }).limit(60), 'no se pudo leer el Overview').map(aVersion)
}

/**
 * Pide la ficha a Claude (por la función del servidor, que guarda la clave) y la guarda
 * como versión nueva. `anterior` va para que la IA lea la evolución y no empiece de cero.
 */
export async function generarVersion(metricas, anterior = null) {
  listo()
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new ErrorHoy('Sin sesión: vuelve a entrar')
  let r
  try {
    r = await fetch('/api/overview', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ metricas, anterior: anterior ? { fecha: anterior.creadaEn, ficha: anterior.ficha } : null }),
    })
  } catch {
    throw new ErrorHoy('No se pudo hablar con el servidor del Overview')
  }
  const cuerpo = await r.json().catch(() => ({}))
  if (!r.ok) throw new ErrorHoy(cuerpo.error || `El Overview falló (${r.status})`)
  const fila = { desde: metricas.periodo.desde, hasta: metricas.periodo.hasta, modelo: cuerpo.modelo, metricas, ficha: cuerpo.ficha }
  return aVersion(uno(await supabase.from('hoy_overview').insert(fila).select().single(), 'no se pudo guardar la ficha'))
}

/* ── puras: las métricas ───────────────────────────────────────────────────── */

const pct = (a, b) => (b ? Math.round((a / b) * 100) : null)
const mediana = (xs) => {
  if (!xs.length) return null
  const o = [...xs].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}
const horaLocal = (ts) => new Date(ts).getHours()
const contar = (pares) => [...pares.entries()].map(([nombre, n]) => ({ nombre, n })).sort((a, b) => b.n - a.n)
const sumar = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n)

/** Racha de días seguidos que cumplen `activo`, hacia atrás desde `hasta` (hoy sin movimiento aún no rompe). */
function rachaHasta(activo, desde, hasta) {
  let dia = activo(hasta) ? hasta : sumarDias(hasta, -1)
  let n = 0
  while (dia >= desde && activo(dia)) { n += 1; dia = sumarDias(dia, -1) }
  return n
}
function mejorRacha(dias, activo) {
  let mejor = 0, va = 0
  for (const d of dias) { va = activo(d) ? va + 1 : 0; mejor = Math.max(mejor, va) }
  return mejor
}

/**
 * Todas las métricas del período `desde..hoy`. `nombreProyecto(t)` pone nombre al proyecto o
 * cliente de una tarea; `cuadrantes` trae las etiquetas de Eisenhower. Devuelve un objeto
 * plano (va tal cual a la IA y a la base): nada de funciones ni fechas como objetos.
 */
export function calcularMetricas({ tareas, habitos, marcas, hitos, reto, bloques, fitMedidas, hoy, statsDesde, nombreProyecto, cuadrantes }) {
  const todas = (tareas || [])
  const primeraActividad = todas.reduce((m, t) => { const d = diaDe(t.creadaEn); return d && (!m || d < m) ? d : m }, null)
  const desde = statsDesde || (primeraActividad && primeraActividad > sumarDias(hoy, -89) ? primeraActividad : sumarDias(hoy, -89))
  const dias = rangoDias(desde, hoy)
  const enRango = (d) => d && d >= desde && d <= hoy

  /* actividad: un día «se movió» si se creó, se completó o se marcó algo */
  const porDia = new Map(dias.map((d) => [d, { creadas: 0, hechas: 0, marcas: 0 }]))
  for (const t of todas) {
    const c = diaDe(t.creadaEn)
    if (enRango(c)) porDia.get(c).creadas += 1
    const h = t.hecha && t.hechaEn ? diaDe(t.hechaEn) : null
    if (enRango(h)) porDia.get(h).hechas += 1
  }
  for (const m of marcas || []) if (enRango(m.fecha)) porDia.get(m.fecha).marcas += 1
  const movio = (d) => { const x = porDia.get(d); return !!x && x.creadas + x.hechas + x.marcas > 0 }
  const diasActivos = dias.filter(movio).length

  /* tareas */
  const creadas = todas.filter((t) => enRango(diaDe(t.creadaEn)))
  const hechas = todas.filter((t) => t.hecha && t.hechaEn && enRango(diaDe(t.hechaEn)))
  const vivas = todas.filter((t) => !t.hecha && !t.archivadoEn)
  const atrasadas = vivas.filter((t) => t.vence && t.vence < hoy)
  const cierre = hechas.map((t) => diasEntre(diaDe(t.creadaEn), diaDe(t.hechaEn))).filter((n) => n >= 0)
  const proyecto = (t) => nombreProyecto(t) || 'Sin proyecto'
  const hechasProyecto = new Map(); for (const t of hechas) sumar(hechasProyecto, proyecto(t))
  const vivasProyecto = new Map(); for (const t of vivas) sumar(vivasProyecto, proyecto(t))
  const etiquetaQ = (q) => (q && cuadrantes?.[q]?.etiqueta) || (q ? q.toUpperCase() : 'Sin cuadrante')
  const vivasQ = new Map(); for (const t of vivas) sumar(vivasQ, etiquetaQ(t.cuadrante))
  const hechasQ = new Map(); for (const t of hechas) sumar(hechasQ, etiquetaQ(t.cuadrante))
  const porHora = Array(24).fill(0); for (const t of hechas) porHora[horaLocal(t.hechaEn)] += 1
  const porSemana = Array(7).fill(0); for (const t of hechas) porSemana[diaSemanaISO(diaDe(t.hechaEn)) - 1] += 1

  /* dónde va el tiempo: lo planificado con hora (tareas) y el raíl fijo del Protocolo */
  const minutosProyecto = new Map()
  let minutosPlanificados = 0
  for (const t of todas) {
    const dia = t.hoyPara || t.vence
    if (!t.horaInicio || !t.horaFin || !enRango(dia)) continue
    const m = aMinutos(t.horaFin) - aMinutos(t.horaInicio)
    if (m <= 0) continue
    sumar(minutosProyecto, proyecto(t), m)
    minutosPlanificados += m
  }
  const minutosFase = new Map()
  for (const b of bloques || []) {
    if (b.activo === false) continue
    let m = aMinutos(b.fin) - aMinutos(b.inicio)
    if (m <= 0) m += 24 * 60
    sumar(minutosFase, b.fase || 'sin fase', m * ((b.dias || []).length || 7))
  }

  /* hábitos */
  const diasConHabitos = dias.map((d) => ({ d, a: adherencia(habitos, marcas, d) })).filter((x) => x.a.tocaban > 0)
  const adherenciaMedia = diasConHabitos.length ? Math.round(diasConHabitos.reduce((s, x) => s + x.a.porcentaje, 0) / diasConHabitos.length) : null
  const perfectos = dias.filter((d) => diaPerfecto(habitos, marcas, d)).length
  const porHabito = (habitos || []).filter((h) => !h.archivadoEn).map((h) => {
    let toca = 0, hecho = 0
    for (const d of dias) { const a = adherencia([h], marcas, d); toca += a.tocaban; hecho += a.hechos }
    return { nombre: h.nombre, tipo: h.tipo || 'hacer', tocaban: toca, hechos: hecho, pct: pct(hecho, toca) }
  }).filter((h) => h.tocaban > 0).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0))

  /* la serie diaria: lo que pintan las gráficas */
  const serie = dias.map((d) => {
    const x = porDia.get(d)
    const a = adherencia(habitos, marcas, d)
    return { fecha: d, ...x, adherencia: a.tocaban ? a.porcentaje : null }
  })

  const ret = reto ? diaDelReto(reto, hoy) : null

  return {
    periodo: { desde, hasta: hoy, dias: dias.length, reiniciadoEl: statsDesde || null },
    consistencia: {
      diasActivos,
      pctActivos: pct(diasActivos, dias.length),
      rachaActual: rachaHasta(movio, desde, hoy),
      mejorRacha: mejorRacha(dias, movio),
      diasPerfectosHabitos: perfectos,
    },
    tareas: {
      creadas: creadas.length,
      hechas: hechas.length,
      cociente: creadas.length ? Math.round((hechas.length / creadas.length) * 100) / 100 : null,
      vivas: vivas.length,
      atrasadas: atrasadas.length,
      sinFecha: vivas.filter((t) => !t.vence).length,
      medianaDiasHastaCerrar: mediana(cierre),
      hechasPorProyecto: contar(hechasProyecto),
      vivasPorProyecto: contar(vivasProyecto),
      vivasPorCuadrante: contar(vivasQ),
      hechasPorCuadrante: contar(hechasQ),
      hechasPorHora: porHora,
      hechasPorDiaSemana: porSemana,
    },
    tiempo: {
      minutosPlanificados,
      porProyecto: contar(minutosProyecto),
      protocoloMinutosSemanaPorFase: contar(minutosFase),
    },
    habitos: { adherenciaMedia, porHabito },
    reto: reto ? { nombre: reto.nombre, inicio: reto.inicio, fin: reto.fin, dia: ret?.dia ?? null, total: ret?.total ?? null } : null,
    hitos: (hitos || []).filter((h) => h.fecha).map((h) => ({ frente: h.frente, nombre: h.nombre, fecha: h.fecha, hecho: h.hecho, dias: diasEntre(hoy, h.fecha) }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    fitness: { medidas: (fitMedidas || []).filter((m) => enRango(m.fecha)).length },
    // muestras con texto: la IA lee de qué van las tareas, no sólo cuántas son
    muestras: {
      vivas: vivas
        .sort((a, b) => (a.vence || '9999').localeCompare(b.vence || '9999'))
        .slice(0, 80)
        .map((t) => ({ titulo: t.titulo, proyecto: proyecto(t), cuadrante: etiquetaQ(t.cuadrante), vence: t.vence, diasAbierta: diasEntre(diaDe(t.creadaEn), hoy) })),
      hechas: hechas
        .sort((a, b) => b.hechaEn.localeCompare(a.hechaEn))
        .slice(0, 50)
        .map((t) => ({ titulo: t.titulo, proyecto: proyecto(t), dia: diaDe(t.hechaEn) })),
    },
    serie,
  }
}

/** Las dimensiones fijas del radar, en orden. La IA puntúa estas y sólo estas. */
export const DIMENSIONES = [
  { clave: 'consistencia', nombre: 'Consistencia' },
  { clave: 'ejecucion', nombre: 'Ejecución' },
  { clave: 'foco', nombre: 'Foco' },
  { clave: 'planificacion', nombre: 'Planificación' },
  { clave: 'carga', nombre: 'Gestión de carga' },
  { clave: 'habitos', nombre: 'Hábitos' },
  { clave: 'cuerpo', nombre: 'Cuerpo' },
  { clave: 'frentes', nombre: 'Frentes' },
]
