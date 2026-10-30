/**
 * finanzasCalculos.js — la única fórmula del dinero de 2day (LOGICA §17.1). Puro: sin red ni
 * base. Lo usan la pantalla (src/pantallas/Finanzas) y el asesor del servidor (api/finanzas.js),
 * así el número que ve Alex y el que lee Claude son el mismo.
 *
 * Todo en la moneda base (EUR). `tasas` = { USD: 1.08, … } = unidades de esa moneda por 1 EUR.
 */

export const CLASES = [
  { valor: 'ingreso', etiqueta: 'Ingreso' },
  { valor: 'obligatorio', etiqueta: 'Obligatorio' },
  { valor: 'recortable', etiqueta: 'Recortable' },
  { valor: 'libre', etiqueta: 'Libre' },
  { valor: 'inversion', etiqueta: 'Inversión' },
  { valor: 'interno', etiqueta: 'Interno' },
]
export const RECURRENCIAS = [
  { valor: '', etiqueta: 'Una vez' },
  { valor: 'semanal', etiqueta: 'Semanal' },
  { valor: 'mensual', etiqueta: 'Mensual' },
  { valor: 'trimestral', etiqueta: 'Trimestral' },
  { valor: 'anual', etiqueta: 'Anual' },
]
export const AREAS = [
  { valor: 'fiscal', etiqueta: 'Fiscal y regularización' },
  { valor: 'residencia', etiqueta: 'Residencia' },
  { valor: 'bancos', etiqueta: 'Bancos y crédito' },
  { valor: 'finanzas', etiqueta: 'Finanzas' },
  { valor: 'inversion', etiqueta: 'Inversión' },
]
// Las categorías con las que se clasifica (a mano, por regla o por la IA) y se dibuja el panel.
export const CATEGORIAS_GASTO = ['Software', 'IA', 'Infraestructura', 'Publicidad', 'Equipo', 'Comisiones', 'Impuestos', 'Asesoría', 'Residencia', 'Viajes', 'Vivienda', 'Comida', 'Transporte', 'Salud', 'Ocio', 'Formación', 'Efectivo', 'Sueldo', 'Inversión', 'Pago de deuda', 'Otros']
export const CATEGORIAS_INGRESO = ['Clientes', 'Afiliados', 'Reembolsos', 'Intereses', 'Aportación', 'Otros']
export const CATEGORIAS = [...new Set([...CATEGORIAS_GASTO, ...CATEGORIAS_INGRESO, 'Transferencia interna', 'Retirada a caja', 'Arqueo de caja'])]
// cuánto pesa un cobro esperado según su certeza (§17.9): lo confirmado cuenta para el día
export const CERTEZAS = [
  { valor: 'confirmado', etiqueta: 'Confirmado' },
  { valor: 'probable', etiqueta: 'Probable' },
  { valor: 'posible', etiqueta: 'Posible' },
]
export const NEGOCIOS = ['CORE', 'EasyBiz', 'Izibizz', 'ScaleInfo', 'GrowthInfo', 'Black Phoenix', 'Personal']

const MES_EN_DIAS = 30.44
const POR_MES = { semanal: 52 / 12, mensual: 1, trimestral: 1 / 3, anual: 1 / 12 }
const VENTANA = 30

/* ── fechas (ISO AAAA-MM-DD, sin husos) ─────────────────────────────────── */
const aFecha = (iso) => new Date(`${iso}T12:00:00Z`)
const aISO = (d) => d.toISOString().slice(0, 10)
export const sumarDias = (iso, n) => { const d = aFecha(iso); d.setUTCDate(d.getUTCDate() + n); return aISO(d) }
export const diasEntre = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 86400000)
export function sumarPaso(iso, recurrencia) {
  const d = aFecha(iso)
  if (recurrencia === 'semanal') d.setUTCDate(d.getUTCDate() + 7)
  else if (recurrencia === 'mensual') d.setUTCMonth(d.getUTCMonth() + 1)
  else if (recurrencia === 'trimestral') d.setUTCMonth(d.getUTCMonth() + 3)
  else d.setUTCFullYear(d.getUTCFullYear() + 1)
  return aISO(d)
}

/* ── dinero ─────────────────────────────────────────────────────────────── */
export function aBase(importe, moneda, tasas = {}) {
  const n = Number(importe) || 0
  if (!moneda || moneda === 'EUR') return n
  const t = Number(tasas[moneda])
  return t > 0 ? n / t : n
}

export function formatear(n, { moneda = 'EUR', decimales = 0, signo = false } = {}) {
  const v = Number(n) || 0
  const txt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda, minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(Math.abs(v))
  if (v < 0) return `−${txt}`
  return signo && v > 0 ? `+${txt}` : txt
}

/** Las fechas en que cae un previsto entre `desde` y `hasta` (ambas incluidas). */
export function ocurrencias(p, desde, hasta) {
  if (!p.fecha || p.estado !== 'previsto') return []
  if (!p.recurrencia) return p.fecha <= hasta ? [p.fecha < desde ? desde : p.fecha] : []
  const fuera = []
  let f = p.fecha
  // lo recurrente atrasado no se acumula: la próxima es la primera >= desde; y para en `p.hasta`
  const tope = p.hasta && p.hasta < hasta ? p.hasta : hasta
  for (let i = 0; f < desde && i < 2000; i++) f = sumarPaso(f, p.recurrencia)
  for (let i = 0; f <= tope && i < 400; i++) { fuera.push(f); f = sumarPaso(f, p.recurrencia) }
  return fuera
}

/** Gasto fijo mensual: recurrentes obligatorio + recortable, más el sueldo del dueño. */
export function gastoFijoMensual(previstos, ajustes, tasas) {
  const recurrentes = previstos
    .filter(p => p.tipo === 'gasto' && p.recurrencia && p.estado === 'previsto' && ['obligatorio', 'recortable'].includes(p.clase))
    .reduce((s, p) => s + aBase(p.importe, p.moneda, tasas) * POR_MES[p.recurrencia], 0)
  return recurrentes + (Number(ajustes?.sueldo_dueno) || 0)
}

export function suscripciones(previstos, tasas) {
  const lista = previstos.filter(p => p.suscripcion && p.estado === 'previsto')
  const mensual = lista.reduce((s, p) => s + aBase(p.importe, p.moneda, tasas) * (POR_MES[p.recurrencia] || 0), 0)
  return { lista, mensual, anual: mensual * 12 }
}

const pendienteDe = (p, tasas) => Math.max(0, aBase(p.importe, p.moneda, tasas) - aBase(p.provisionado, p.moneda, tasas))

/**
 * Meses de autonomía (§17.1, Alex 30-10-2026): con el dinero de hoy (caja y bancos) y los
 * gastos e ingresos PREVISTOS, cuánto aguanta la caja antes de llegar a cero. Se simula día a
 * día hasta 5 años: cada previsto en sus fechas y el sueldo del dueño repartido por días. Si la
 * caja no baja nunca, es sostenible. `extraHoy` = un pago que se haría hoy (para el «y si pago…»).
 */
export function autonomia({ previstos = [], ajustes = {}, hoy }, liquidez, extraHoy = 0, certezas = ['confirmado']) {
  const tasas = ajustes.tasas?.valores || {}
  const HORIZONTE = 1826
  const fin = sumarDias(hoy, HORIZONTE)
  const porFecha = new Map()
  for (const p of previstos) {
    if (p.estado !== 'previsto' || p.importe == null || p.importe === '') continue
    // los cobros sólo cuentan con la certeza pedida; los pagos, siempre
    if (p.tipo === 'ingreso' && !certezas.includes(p.certeza || 'confirmado')) continue
    const v = (p.tipo === 'ingreso' ? 1 : -1) * aBase(p.importe, p.moneda, tasas)
    for (const f of ocurrencias(p, hoy, fin)) porFecha.set(f, (porFecha.get(f) || 0) + v)
  }
  const sueldoDia = (Number(ajustes.sueldo_dueno) || 0) / MES_EN_DIAS
  let saldo = liquidez - extraHoy
  let minimo = saldo
  for (let d = 0; d <= HORIZONTE; d++) {
    saldo += (porFecha.get(sumarDias(hoy, d)) || 0) - sueldoDia
    minimo = Math.min(minimo, saldo)
    if (saldo < 0) return { meses: d / MES_EN_DIAS, dias: d, cae: sumarDias(hoy, d), sostenible: false }
  }
  return { meses: null, dias: null, cae: null, sostenible: true, minimo }
}

/**
 * El resumen del día. Devuelve la cascada entera para poder explicarla línea a línea:
 * caja y bancos − lo comprometido en 30 días = disponible; ÷ 30 = lo de hoy.
 */
export function resumen({ cuentas = [], movimientos = [], previstos = [], objetivos = [], partidas = [], ajustes = {}, hoy }) {
  const tasas = ajustes.tasas?.valores || {}
  const fin = sumarDias(hoy, VENTANA)
  const vivos = movimientos.filter(m => m.estado !== 'cancelado')

  // caja y bancos: todas las cuentas activas (Wise, Mercury, Whop, efectivo y manuales)
  const liquidez = cuentas.filter(c => c.activa !== false).reduce((s, c) => s + aBase(c.saldo, c.moneda, tasas), 0)
  const fijoMes = gastoFijoMensual(previstos, ajustes, tasas)

  const proximos = []
  let comprometido = 0
  let cobrosSeguros = 0
  const sinImporte = []
  for (const p of previstos) {
    if (p.estado !== 'previsto' || !p.fecha) continue
    if (p.importe == null || p.importe === '') { if (p.tipo === 'gasto') sinImporte.push(p); continue }
    for (const f of ocurrencias(p, hoy, fin)) {
      const base = aBase(p.importe, p.moneda, tasas)
      if (p.tipo === 'gasto') comprometido += base
      else if ((p.certeza || 'confirmado') === 'confirmado') cobrosSeguros += base
      proximos.push({ ...p, cae: f, base })
    }
  }
  // el sueldo del dueño es un gasto obligatorio del mes que viene, aunque no sea un previsto
  const sueldo = Number(ajustes.sueldo_dueno) || 0
  comprometido += sueldo
  proximos.sort((a, b) => a.cae.localeCompare(b.cae))

  // lo de hoy sale de la caja, menos lo que hay que pagar y más lo que entra SEGURO en 30 días
  const disponible = liquidez - comprometido + cobrosSeguros
  const gastadoHoy = vivos.filter(m => m.fecha === hoy && m.clase === 'libre' && m.importe < 0)
    .reduce((s, m) => s - aBase(m.importe, m.moneda, tasas), 0)
  const porDia = disponible / VENTANA
  const hoyPuedes = porDia - gastadoHoy
  const ingresosPrevistos = proximos.filter(p => p.tipo === 'ingreso' && (p.certeza || 'confirmado') !== 'confirmado').reduce((s, p) => s + p.base, 0)

  // autonomía con lo previsto; y, de contraste, con el gasto real de los últimos 30 días
  const aut = autonomia({ previstos, ajustes, hoy }, liquidez)
  // con las cuotas o el vencimiento ya puestos, la deuda está en los previstos; si no, el «y si la pago hoy»
  const deudaSinFecha = partidas.filter(p => p.activa !== false && p.lado === 'pasivo' && p.plazo === 'corriente' && !previstos.some(x => x.partida_id === p.id && x.estado === 'previsto'))
    .reduce((s, p) => s + aBase(p.valor, p.moneda, tasas), 0)
  const autConDeuda = deudaSinFecha > 0 ? autonomia({ previstos, ajustes, hoy }, liquidez, deudaSinFecha) : null
  const hayProbables = previstos.some(p => p.tipo === 'ingreso' && p.estado === 'previsto' && p.certeza === 'probable')
  const autProbables = hayProbables ? autonomia({ previstos, ajustes, hoy }, liquidez, 0, ['confirmado', 'probable']) : null

  // fondo de maniobra (§17.9): caja y bancos + cobros confirmados a un año − deudas a corto y pagos de deuda a un año
  const anio = sumarDias(hoy, 365)
  const cobrosAnio = previstos.filter(p => p.tipo === 'ingreso' && (p.certeza || 'confirmado') === 'confirmado' && p.importe != null)
    .reduce((s, p) => s + ocurrencias(p, hoy, anio).length * aBase(p.importe, p.moneda, tasas), 0)
  const deudasCorto = partidas.filter(p => p.activa !== false && p.lado === 'pasivo')
    .map(p => {
      const cuotas = previstos.filter(x => x.partida_id === p.id && x.estado === 'previsto' && x.importe != null)
      const enAnio = cuotas.reduce((s, x) => s + ocurrencias(x, hoy, anio).length * aBase(x.importe, x.moneda, tasas), 0)
      // lo que queda = la deuda menos lo ya pagado por el banco contra sus cuotas
      const ids = new Set(previstos.filter(x => x.partida_id === p.id).map(x => x.id))
      const pagado = vivos.filter(m => ids.has(m.previsto_id) && m.importe < 0).reduce((s, m) => s - aBase(m.importe, m.moneda, tasas), 0)
      const pendiente = Math.max(0, aBase(p.valor, p.moneda, tasas) - pagado)
      // a corto: lo que vence en 12 meses según su calendario; sin calendario, toda si es corriente
      const corto = cuotas.length ? Math.min(pendiente, enAnio) : p.plazo === 'corriente' ? pendiente : 0
      const proxima = cuotas.map(x => ocurrencias(x, hoy, sumarDias(hoy, 3650))[0]).filter(Boolean).sort()[0] || null
      return { ...p, pendiente, pagado, corto, proxima, plan: cuotas[0] }
    })
  const pasivoCorto = deudasCorto.reduce((s, p) => s + p.corto, 0)
  const fondoManiobra = { caja: liquidez, cobros: cobrosAnio, deudas: pasivoCorto, total: liquidez + cobrosAnio - pasivoCorto, lista: deudasCorto }
  const r = ritmo({ movimientos: vivos, previstos, ajustes, hoy, tasas })
  const quemaReal = (r.gastosDia - r.ingresosDia) * MES_EN_DIAS
  const autReal = r.fuente === 'banco' && quemaReal > 0 ? Math.max(0, liquidez) / quemaReal : null

  const mision = misionDe({ objetivos, movimientos: vivos, previstos, ajustes, hoy, liquidez, tasas })
  const semaforo = disponible < 0 || (!aut.sostenible && aut.meses < 1) ? 'rojo'
    : (!aut.sostenible && aut.meses < 3) || (mision && mision.ritmoReal < mision.necesarioDia) ? 'ambar' : 'verde'

  return {
    hoy, liquidez, comprometido, sueldo, disponible, porDia, gastadoHoy, hoyPuedes,
    ingresosPrevistos, conIngresos: (disponible + ingresosPrevistos) / VENTANA,
    fijoMes, proximos, sinImporte, semaforo, mision,
    autonomia: aut, autonomiaConDeuda: autConDeuda, deudaCorta: deudaSinFecha, autonomiaProbables: autProbables, cobrosSeguros, fondoManiobra, autonomiaReal: autReal, quemaReal: r.fuente === 'banco' ? quemaReal : null,
    sinDatos: cuentas.length === 0,
  }
}

/** Ritmo neto diario: banco de los últimos 30 días; con poca historia, los previstos recurrentes. */
export function ritmo({ movimientos, previstos, ajustes, hoy, tasas }) {
  const desde = sumarDias(hoy, -30)
  const recientes = movimientos.filter(m => m.fecha > desde && m.fecha <= hoy && m.clase !== 'interno')
  const primera = movimientos.reduce((min, m) => (!min || m.fecha < min ? m.fecha : min), null)
  const historia = primera ? diasEntre(primera, hoy) : 0
  if (historia >= 14) {
    const ingresos = recientes.filter(m => m.importe > 0).reduce((s, m) => s + aBase(m.importe, m.moneda, tasas), 0)
    const gastos = recientes.filter(m => m.importe < 0).reduce((s, m) => s - aBase(m.importe, m.moneda, tasas), 0)
    const dias = Math.min(30, historia)
    return { fuente: 'banco', ingresosDia: ingresos / dias, gastosDia: gastos / dias }
  }
  const mensual = (tipo) => previstos
    .filter(p => p.tipo === tipo && p.recurrencia && p.estado === 'previsto' && p.importe != null)
    .reduce((s, p) => s + aBase(p.importe, p.moneda, tasas) * POR_MES[p.recurrencia], 0)
  const sueldo = Number(ajustes?.sueldo_dueno) || 0
  return { fuente: 'previstos', ingresosDia: mensual('ingreso') / MES_EN_DIAS, gastosDia: (mensual('gasto') + sueldo) / MES_EN_DIAS }
}

function misionDe({ objetivos, movimientos, previstos, ajustes, hoy, liquidez, tasas }) {
  const o = objetivos.find(x => x.principal)
  if (!o?.importe || !o.fecha) return null
  const meta = aBase(o.importe, o.moneda, tasas)
  const dias = Math.max(1, diasEntre(hoy, o.fecha))
  const r = ritmo({ movimientos, previstos, ajustes, hoy, tasas })
  const ritmoReal = r.ingresosDia - r.gastosDia
  const falta = Math.max(0, meta - liquidez)
  return {
    titulo: o.titulo, meta, fecha: o.fecha, dias, falta, actual: liquidez,
    pct: meta > 0 ? Math.min(1, Math.max(0, liquidez / meta)) : 0,
    necesarioDia: falta / dias, ritmoReal, fuenteRitmo: r.fuente,
    llegada: liquidez + ritmoReal * dias,
  }
}

/**
 * Proyección diaria hasta la fecha del objetivo principal (o 365 días). Tres escenarios.
 * Los previstos PUNTUALES se suman/restan en su fecha; los recurrentes ya van en el ritmo.
 */
export function proyeccion({ cuentas = [], movimientos = [], previstos = [], objetivos = [], ajustes = {}, hoy }) {
  const tasas = ajustes.tasas?.valores || {}
  const liquidez = cuentas.filter(c => c.activa !== false).reduce((s, c) => s + aBase(c.saldo, c.moneda, tasas), 0)
  const o = objetivos.find(x => x.principal)
  const fin = o?.fecha && o.fecha > hoy ? o.fecha : sumarDias(hoy, 365)
  const dias = diasEntre(hoy, fin)
  const r = ritmo({ movimientos, previstos, ajustes, hoy, tasas })
  const puntuales = previstos.filter(p => p.estado === 'previsto' && !p.recurrencia && p.fecha && p.importe != null && p.fecha >= hoy && p.fecha <= fin)
  const meta = o?.importe ? aBase(o.importe, o.moneda, tasas) : null
  const paso = Math.max(1, Math.round(dias / 120))
  const puntos = []
  let saltos = 0
  for (let d = 0; d <= dias; d++) {
    const f = sumarDias(hoy, d)
    for (const p of puntuales) if (p.fecha === f) saltos += (p.tipo === 'ingreso' ? 1 : -1) * pendienteDe(p, tasas)
    if (d % paso === 0 || d === dias) {
      puntos.push({
        fecha: f, d,
        igual: liquidez + (r.ingresosDia - r.gastosDia) * d + saltos,
        conservador: liquidez + (r.ingresosDia * 0.7 - r.gastosDia) * d + saltos,
        objetivo: meta == null ? null : liquidez + (meta - liquidez) * d / Math.max(1, dias),
      })
    }
  }
  return { puntos, fin, meta, fuente: r.fuente }
}

/**
 * Empareja transferencias internas (Whop → Wise/Mercury, Wise → Mercury): una salida y una entrada en otro banco con el
 * mismo importe (±2 %, misma moneda) y ≤ 5 días entre una y otra. Devuelve pares [salida, entrada].
 */
export function emparejarInternos(movimientos, cuentas) {
  const banco = Object.fromEntries(cuentas.map(c => [c.id, c.banco]))
  const libres = movimientos.filter(m => !m.emparejado_id && m.origen === 'banco')
  // Whop → Wise o Mercury (los retiros), y Wise → Mercury
  const salidas = libres.filter(m => ['wise', 'whop'].includes(banco[m.cuenta_id]) && m.importe < 0)
  const entradas = libres.filter(m => ['mercury', 'wise'].includes(banco[m.cuenta_id]) && m.importe > 0)
  const usadas = new Set()
  const pares = []
  for (const s of salidas) {
    const e = entradas.find(x => !usadas.has(x.id) && banco[x.cuenta_id] !== banco[s.cuenta_id] && x.moneda === s.moneda
      && Math.abs(x.importe + s.importe) <= Math.abs(s.importe) * 0.02
      && Math.abs(diasEntre(s.fecha, x.fecha)) <= 5 && x.fecha >= sumarDias(s.fecha, -1))
    if (e) { usadas.add(e.id); pares.push([s, e]) }
  }
  return pares
}

/* ── clasificar (LOGICA §17.5) ──────────────────────────────────────────── */

const unir = (...listas) => [...new Set(listas.flat().map(x => String(x ?? '').trim()).filter(Boolean))]
/**
 * Las opciones de los selectores (§17.6): las de serie, las que Alex ha creado (`ajustes.listas`)
 * y las que ya aparecen en los datos. Así nada de lo usado desaparece de la lista.
 */
export function opcionesDe({ ajustes = {}, movimientos = [], previstos = [] }) {
  const l = ajustes.listas || {}
  const reales = movimientos.filter(m => m.clase !== 'interno')
  return {
    gasto: unir(CATEGORIAS_GASTO, l.gasto || [], reales.filter(m => m.importe < 0).map(m => m.categoria), previstos.filter(p => p.tipo === 'gasto').map(p => p.categoria)),
    ingreso: unir(CATEGORIAS_INGRESO, l.ingreso || [], reales.filter(m => m.importe > 0).map(m => m.categoria), previstos.filter(p => p.tipo === 'ingreso').map(p => p.categoria)),
    negocios: unir(NEGOCIOS, l.negocios || [], movimientos.map(m => m.negocio), previstos.map(p => p.negocio)),
  }
}

/** El importe en la moneda del cargo («Card transaction of 52.74 USD…»): una suscripción en dólares se prevé en dólares. */
export function importeOriginal(m) {
  const t = /of ([\d.,]+) ([A-Z]{3})\b/.exec(m.descripcion || '')
  const n = t ? Number(t[1].replace(/,/g, '')) : NaN
  return Number.isFinite(n) && n > 0 ? { importe: n, moneda: t[2] } : { importe: Math.abs(Number(m.importe) || 0), moneda: m.moneda }
}

/** Le falta clase o categoría y no está cancelado: va a la cola de «Por clasificar». */
export const porClasificar = (m) => m.estado !== 'cancelado' && (!m.clase || !m.categoria)

// el texto con el que casan las reglas: contraparte + concepto, en minúsculas y sin cifras
// (así «Fib_atm_afib0401» y «Fib_atm_afib0402» son el mismo cajero)
const normal = (t) => String(t || '').toLowerCase().replace(/[0-9]+/g, '').replace(/\s+/g, ' ').trim()
export const textoDe = (m) => normal(`${m.contraparte || ''} ${m.descripcion || ''}`)
/** El patrón que aprende una regla a partir de un movimiento: su contraparte (o su concepto). */
export const patronDe = (m) => normal(m.contraparte || m.descripcion).slice(0, 60)
export const sentidoDe = (m) => (Number(m.importe) > 0 ? 'ingreso' : 'gasto')
export const casaRegla = (m, r) => !!r.patron && textoDe(m).includes(r.patron) && (!r.sentido || r.sentido === sentidoDe(m))

/* ── el panel ───────────────────────────────────────────────────────────── */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function agrupar(lista, clave, vacio = 'Sin clasificar') {
  const mapa = new Map()
  for (const m of lista) {
    const k = clave(m) || vacio
    const g = mapa.get(k) || { clave: k, total: 0, n: 0, movimientos: [] }
    g.total += m.eur
    g.n += 1
    g.movimientos.push(m)
    mapa.set(k, g)
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total)
}

/**
 * Todo lo que dibuja el panel, para el periodo [desde, hoy]. Los internos (Wise → Mercury) y lo
 * cancelado no cuentan: ni entra ni sale dinero. Cada movimiento lleva `eur` (en positivo).
 */
export function panel({ cuentas = [], movimientos = [], ajustes = {}, hoy }, desde, tramo = 'auto') {
  const tasas = ajustes.tasas?.valores || {}
  const vivos = movimientos.filter(m => m.estado !== 'cancelado')
  const reales = vivos.filter(m => m.clase !== 'interno')
  const conEur = (m) => ({ ...m, eur: Math.abs(aBase(m.importe, m.moneda, tasas)) })
  const enPeriodo = reales.filter(m => (!desde || m.fecha >= desde) && m.fecha <= hoy).map(conEur)
  const entradas = enPeriodo.filter(m => m.importe > 0)
  const salidas = enPeriodo.filter(m => m.importe < 0)
  const entra = entradas.reduce((s, m) => s + m.eur, 0)
  const sale = salidas.reduce((s, m) => s + m.eur, 0)

  // flujo: por semanas (lunes a domingo) si el periodo cabe en 3 meses; si no, por meses (máx. 12)
  const primero = enPeriodo.reduce((min, m) => (m.fecha < min ? m.fecha : min), hoy)
  const arranque = desde && desde > primero ? desde : primero
  const largo = diasEntre(arranque, hoy)
  const modo = tramo === 'auto' ? (largo <= 92 ? 'semana' : 'mes') : tramo
  const porSemana = modo === 'semana'
  const tramos = []
  if (modo === 'dia') {
    for (let f = sumarDias(hoy, -Math.min(largo, 59)); f <= hoy; f = sumarDias(f, 1)) {
      const [, mm, dd] = f.split('-').map(Number)
      tramos.push({ clave: f, hasta: f, etiqueta: `${dd} ${MESES[mm - 1]}`, titulo: new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }) })
    }
  } else if (porSemana) {
    let f = sumarDias(arranque, -((aFecha(arranque).getUTCDay() + 6) % 7)) // el lunes de esa semana
    for (; f <= hoy; f = sumarDias(f, 7)) {
      const [, mm, dd] = f.split('-').map(Number)
      tramos.push({ clave: f, hasta: sumarDias(f, 6), etiqueta: `${dd} ${MESES[mm - 1]}`, titulo: `Semana del ${dd} ${MESES[mm - 1]}` })
    }
  } else {
    for (let [a, mm] = arranque.slice(0, 7).split('-').map(Number); `${a}-${String(mm).padStart(2, '0')}` <= hoy.slice(0, 7); mm === 12 ? (a++, mm = 1) : mm++) {
      const clave = `${a}-${String(mm).padStart(2, '0')}`
      tramos.push({ clave: `${clave}-01`, hasta: `${clave}-31`, etiqueta: `${MESES[mm - 1]}${mm === 1 || tramos.length === 0 ? ` ${String(a).slice(2)}` : ''}`, titulo: `${MESES[mm - 1]} ${a}` })
    }
  }
  const flujo = tramos.slice(modo === 'dia' ? -60 : -12).map(t => {
    const del = enPeriodo.filter(m => m.fecha >= t.clave && m.fecha <= t.hasta)
    return { ...t, entra: del.filter(m => m.importe > 0).reduce((s, m) => s + m.eur, 0), sale: del.filter(m => m.importe < 0).reduce((s, m) => s + m.eur, 0) }
  })

  // saldo día a día hacia atrás desde la liquidez de hoy (las cuentas activas mandan)
  const activas = new Set(cuentas.filter(c => c.activa !== false).map(c => c.id))
  let saldo = cuentas.filter(c => c.activa !== false).reduce((s, c) => s + aBase(c.saldo, c.moneda, tasas), 0)
  const porDia = new Map()
  for (const m of vivos) if (activas.has(m.cuenta_id)) porDia.set(m.fecha, (porDia.get(m.fecha) || 0) + aBase(m.importe, m.moneda, tasas))
  const inicioSaldo = [...porDia.keys()].reduce((min, f) => (f < min ? f : min), hoy)
  const desdeSaldo = desde && desde > inicioSaldo ? desde : sumarDias(inicioSaldo, -1)
  const serie = []
  for (let f = hoy; f >= desdeSaldo; f = sumarDias(f, -1)) {
    serie.push({ fecha: f, saldo })
    saldo -= porDia.get(f) || 0 // el saldo al cierre del día anterior
  }
  serie.reverse()

  const dias = Math.max(1, diasEntre(arranque, hoy) + 1)
  return {
    entra, sale, neto: entra - sale, ahorro: entra > 0 ? (entra - sale) / entra : null, gastoDia: sale / dias,
    n: enPeriodo.length, sinClasificar: enPeriodo.filter(porClasificar).length,
    flujo, modo, serie,
    // el ritmo del periodo: lo que entra, sale y queda de media al día, a la semana y al mes
    ritmo: { dias, dia: { entra: entra / dias, sale: sale / dias }, semana: { entra: entra / dias * 7, sale: sale / dias * 7 }, mes: { entra: entra / dias * MES_EN_DIAS, sale: sale / dias * MES_EN_DIAS } },
    categorias: agrupar(salidas, m => m.categoria),
    clases: agrupar(salidas, m => CLASES.find(c => c.valor === m.clase)?.etiqueta),
    clientes: agrupar(entradas, m => m.contraparte || m.descripcion).slice(0, 8),
    // «Fib_atm_afib0401» y «…0402» son el mismo cajero: fuera el número del final
    comercios: agrupar(salidas, m => (m.contraparte || m.descripcion || '').replace(/[\s_-]*\d+$/, '')).slice(0, 10),
    negocios: agrupar(salidas, m => m.negocio, 'Sin negocio'),
  }
}
