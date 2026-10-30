/**
 * contabilidad.js — la contabilidad de 2day por partida doble (LOGICA §17.7). Puro: sin red ni base.
 *
 * Cada movimiento del banco (o apuntado a mano) es un ASIENTO con dos líneas que cuadran: la
 * cuenta de tesorería (570 caja, 572 bancos, Whop incluido) y su contrapartida, que sale de la
 * clase, la categoría y el negocio. Las partidas (inmovilizado y deudas) entran contra capital.
 * Del libro diario salen el mayor, el balance de situación y la cuenta de resultados, así que
 * Activo = Pasivo + Patrimonio neto por construcción.
 *
 * Cuadro de cuentas: el del PGC español, adaptado a una LLC de un solo socio (disregarded
 * entity): lo personal pagado por la empresa no es gasto, es una retirada del socio (551), y
 * se presenta restando en el patrimonio neto (owner's draw). Todo en EUR al cambio del día.
 */
import { aBase, sumarDias } from './finanzasCalculos.js'

export const PLAN = {
  100: 'Capital (fondos del socio)',
  118: 'Aportaciones del socio',
  129: 'Resultado del ejercicio',
  170: 'Deudas a largo plazo',
  217: 'Equipos para procesos de información',
  250: 'Inversiones financieras a largo plazo',
  2817: 'Amortización acumulada de equipos',
  520: 'Deudas a corto plazo',
  551: 'Cuenta corriente con el socio (retiradas)',
  555: 'Partidas pendientes de aplicación',
  570: 'Caja',
  572: 'Bancos',
  5790: 'Traspasos internos y reembolsos',
  621: 'Arrendamientos',
  623: 'Servicios de profesionales independientes',
  626: 'Servicios bancarios y comisiones',
  627: 'Publicidad y propaganda',
  6291: 'Software, IA e infraestructura',
  6292: 'Viajes y desplazamientos',
  6293: 'Comidas y atenciones',
  6294: 'Formación',
  6299: 'Otros servicios',
  631: 'Otros tributos',
  640: 'Sueldos y salarios',
  681: 'Amortización y deterioro del inmovilizado',
  705: 'Prestaciones de servicios',
  759: 'Ingresos por servicios diversos',
  769: 'Otros ingresos financieros',
}

const GASTO = {
  Software: '6291', IA: '6291', Infraestructura: '6291',
  Viajes: '6292', Transporte: '6292', Comida: '6293', Formación: '6294',
  Vivienda: '621', Equipo: '623', Asesoría: '623', Residencia: '623',
  Comisiones: '626', Publicidad: '627', Impuestos: '631', Sueldo: '640',
  Efectivo: '570', Inversión: '250', 'Pago de deuda': '520',
}
const INGRESO = { Clientes: '705', Afiliados: '759', Intereses: '769', Aportación: '118', Reembolsos: '5790', Otros: '759' }

const nombreDe = (cuenta, cuentas) => {
  if (cuenta.includes('.')) return cuentas[cuenta]?.nombre || PLAN[cuenta.split('.')[0]]
  return PLAN[cuenta] || cuenta
}
/** La subcuenta de tesorería de una cuenta: 570.x si es efectivo, 572.x si es banco o Whop. */
const tesoreriaDe = (c) => `${c?.tipo === 'efectivo' ? '570' : '572'}.${c?.id?.slice(0, 4) || 'man'}`

/** La contrapartida de un movimiento: de dónde viene o a dónde va el dinero. */
export function contrapartida(m) {
  if (!m.clase || !m.categoria) return '555'
  if (m.clase === 'interno') return m.categoria === 'Aportación' ? '118' : '5790'
  if (m.importe > 0) return INGRESO[m.categoria] || '759'
  // lo personal pagado con dinero de la empresa es una retirada del socio, no un gasto
  if (m.negocio === 'Personal' && m.categoria !== 'Pago de deuda') return '551'
  if (m.clase === 'inversion' && m.categoria === 'Inversión') return '250'
  return GASTO[m.categoria] || '6299'
}

/** El libro diario completo, en orden: apertura, partidas, un asiento por movimiento y los ajustes. */
export function libroDiario({ cuentas = [], movimientos = [], partidas = [], ajustes = {}, hoy }) {
  const tasas = ajustes.tasas?.valores || {}
  const porId = Object.fromEntries(cuentas.map(c => [c.id, c]))
  const subcuentas = {}
  for (const c of cuentas) subcuentas[tesoreriaDe(c)] = { nombre: c.nombre }
  const vivos = movimientos.filter(m => m.estado !== 'cancelado' && m.fecha <= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.created_at).localeCompare(String(b.created_at)))
  const eur = (n, moneda) => Math.round(aBase(n, moneda, tasas) * 100) / 100
  const asientos = []
  const anadir = (fecha, concepto, lineas, extra = {}) => {
    const l = lineas.filter(x => Math.abs(x.debe || 0) + Math.abs(x.haber || 0) > 0.0049)
      .map(x => ({ ...x, nombre: nombreDe(x.cuenta, subcuentas), debe: x.debe || 0, haber: x.haber || 0 }))
    if (l.length) asientos.push({ fecha, concepto, lineas: l, ...extra })
  }

  // apertura: el saldo de cada cuenta el día antes del primer movimiento, contra capital
  const primera = [vivos[0]?.fecha, ...partidas.map(p => p.fecha)].filter(Boolean).sort()[0] || hoy
  const apertura = sumarDias(primera, -1)
  const lineasApertura = []
  for (const c of cuentas.filter(x => x.activa !== false)) {
    const movido = vivos.filter(m => m.cuenta_id === c.id).reduce((s, m) => s + eur(m.importe, m.moneda), 0)
    const inicial = Math.round((eur(c.saldo, c.moneda) - movido) * 100) / 100
    if (inicial > 0) lineasApertura.push({ cuenta: tesoreriaDe(c), debe: inicial })
    else if (inicial < 0) lineasApertura.push({ cuenta: tesoreriaDe(c), haber: -inicial })
  }
  const dentro = partidas.filter(p => p.activa !== false && p.fecha <= primera)
  const despues = partidas.filter(p => p.activa !== false && p.fecha > primera)
  const lineaPartida = (p) => {
    const v = eur(p.valor_origen ?? p.valor, p.moneda)
    return p.lado === 'activo' ? { cuenta: p.cuenta, debe: v, concepto: p.nombre } : { cuenta: p.cuenta, haber: v, concepto: p.nombre }
  }
  lineasApertura.push(...dentro.map(lineaPartida))
  const descuadre = lineasApertura.reduce((s, l) => s + (l.debe || 0) - (l.haber || 0), 0)
  lineasApertura.push(descuadre >= 0 ? { cuenta: '100', haber: descuadre } : { cuenta: '100', debe: -descuadre })
  anadir(apertura, 'Asiento de apertura', lineasApertura, { tipo: 'apertura' })

  // lo que se da de alta después de la apertura, también contra capital
  for (const p of despues) {
    const l = lineaPartida(p)
    anadir(p.fecha, `Alta: ${p.nombre}`, [l, l.debe ? { cuenta: '100', haber: l.debe } : { cuenta: '100', debe: l.haber }], { tipo: 'partida', partidaId: p.id })
  }

  for (const m of vivos) {
    const v = Math.abs(eur(m.importe, m.moneda))
    const tes = tesoreriaDe(porId[m.cuenta_id])
    const contra = contrapartida(m)
    const concepto = m.contraparte || m.descripcion || 'Movimiento'
    anadir(m.fecha, concepto, m.importe > 0
      ? [{ cuenta: tes, debe: v }, { cuenta: contra, haber: v }]
      : [{ cuenta: contra, debe: v }, { cuenta: tes, haber: v }], { tipo: 'movimiento', movimientoId: m.id, pendiente: contra === '555' })
  }

  // ajustes de valor: si el inmovilizado vale menos que cuando entró, la pérdida es amortización/deterioro
  for (const p of partidas.filter(x => x.activa !== false && x.lado === 'activo' && x.valor_origen != null)) {
    const perdida = eur(Number(p.valor_origen) - Number(p.valor), p.moneda)
    if (perdida > 0) anadir(hoy, `Ajuste a valor de mercado: ${p.nombre}`, [{ cuenta: '681', debe: perdida }, { cuenta: '2817', haber: perdida }], { tipo: 'ajuste', partidaId: p.id })
  }
  // las deudas que Alex rebaja a mano (sin pago por el banco) se regularizan contra capital
  for (const p of partidas.filter(x => x.activa !== false && x.lado === 'pasivo' && x.valor_origen != null)) {
    const baja = eur(Number(p.valor_origen) - Number(p.valor), p.moneda)
    if (Math.abs(baja) > 0.0049) anadir(hoy, `Regularización: ${p.nombre}`, baja > 0 ? [{ cuenta: p.cuenta, debe: baja }, { cuenta: '100', haber: baja }] : [{ cuenta: '100', debe: -baja }, { cuenta: p.cuenta, haber: -baja }], { tipo: 'ajuste', partidaId: p.id })
  }

  asientos.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.tipo === 'apertura' ? -1 : 0))
  asientos.forEach((a, i) => { a.n = i + 1 })
  return { asientos, subcuentas }
}

/** El mayor: saldo (debe − haber) y apuntes de cada cuenta. */
export function mayor(asientos) {
  const cuentas = {}
  for (const a of asientos) {
    for (const l of a.lineas) {
      const c = cuentas[l.cuenta] || (cuentas[l.cuenta] = { cuenta: l.cuenta, nombre: l.nombre, debe: 0, haber: 0, apuntes: [] })
      c.debe += l.debe
      c.haber += l.haber
      c.apuntes.push({ n: a.n, fecha: a.fecha, concepto: l.concepto || a.concepto, debe: l.debe, haber: l.haber, movimientoId: a.movimientoId })
    }
  }
  for (const c of Object.values(cuentas)) c.saldo = Math.round((c.debe - c.haber) * 100) / 100
  return cuentas
}

const raiz = (cuenta) => cuenta.split('.')[0]
const grupo = (cuenta) => raiz(cuenta)[0]

/** La cuenta de resultados de [desde, hasta]: ingresos (7) − gastos (6). */
export function resultados(asientos, desde, hasta) {
  const del = asientos.filter(a => (!desde || a.fecha >= desde) && (!hasta || a.fecha <= hasta))
  const m = mayor(del)
  const lista = (g) => Object.values(m).filter(c => grupo(c.cuenta) === g)
    .map(c => ({ cuenta: c.cuenta, nombre: c.nombre, importe: g === '7' ? -c.saldo : c.saldo, apuntes: c.apuntes }))
    .filter(c => Math.abs(c.importe) > 0.0049).sort((a, b) => b.importe - a.importe)
  const ingresos = lista('7')
  const gastos = lista('6')
  const ti = ingresos.reduce((s, c) => s + c.importe, 0)
  const tg = gastos.reduce((s, c) => s + c.importe, 0)
  const financieros = ingresos.filter(c => raiz(c.cuenta).startsWith('76')).reduce((s, c) => s + c.importe, 0)
  return { ingresos, gastos, totalIngresos: ti, totalGastos: tg, explotacion: ti - financieros - tg, financieros, resultado: ti - tg }
}

/**
 * El balance de situación a `hasta`. Activo (no corriente: 2; corriente: 5 deudor) frente a
 * Pasivo (no corriente: 17; corriente: 5 acreedor) y Patrimonio neto (100, 118, retiradas 551 y
 * el resultado, que es lo que queda en 6 y 7). Cuadra siempre: lo comprueba `cuadra`.
 */
export function balance(asientos, hasta) {
  const m = mayor(asientos.filter(a => !hasta || a.fecha <= hasta))
  const todas = Object.values(m).filter(c => Math.abs(c.saldo) > 0.0049)
  const linea = (c, signo = 1) => ({ cuenta: c.cuenta, nombre: c.nombre, importe: c.saldo * signo, apuntes: c.apuntes })
  const ancla = (cs, f) => cs.filter(f)

  const noCorriente = ancla(todas, c => grupo(c.cuenta) === '2').map(c => linea(c))
  const tesoreria = ancla(todas, c => ['570', '572'].includes(raiz(c.cuenta))).map(c => linea(c))
  const otrosCorriente = ancla(todas, c => ['555', '5790'].includes(raiz(c.cuenta)) && c.saldo > 0).map(c => linea(c))
  const pasivoNoCorriente = ancla(todas, c => raiz(c.cuenta) === '170').map(c => linea(c, -1))
  const pasivoCorriente = [
    ...ancla(todas, c => raiz(c.cuenta) === '520').map(c => linea(c, -1)),
    ...ancla(todas, c => ['555', '5790'].includes(raiz(c.cuenta)) && c.saldo < 0).map(c => linea(c, -1)),
  ]
  const resultado = -todas.filter(c => ['6', '7'].includes(grupo(c.cuenta))).reduce((s, c) => s + c.saldo, 0)
  const patrimonio = [
    ...ancla(todas, c => ['100', '118'].includes(raiz(c.cuenta))).map(c => linea(c, -1)),
    ...ancla(todas, c => raiz(c.cuenta) === '551').map(c => ({ ...linea(c, -1), nombre: 'Retiradas del socio' })),
    { cuenta: '129', nombre: PLAN[129], importe: resultado, apuntes: [] },
  ]
  const suma = (l) => l.reduce((s, c) => s + c.importe, 0)
  const activo = suma(noCorriente) + suma(tesoreria) + suma(otrosCorriente)
  const pasivo = suma(pasivoNoCorriente) + suma(pasivoCorriente)
  const pn = suma(patrimonio)
  return {
    activo: { noCorriente, tesoreria, otrosCorriente, total: activo, totalNoCorriente: suma(noCorriente), totalCorriente: suma(tesoreria) + suma(otrosCorriente) },
    pasivo: { noCorriente: pasivoNoCorriente, corriente: pasivoCorriente, total: pasivo, totalNoCorriente: suma(pasivoNoCorriente), totalCorriente: suma(pasivoCorriente) },
    patrimonio: { lineas: patrimonio, total: pn },
    tesoreria: suma(tesoreria),
    fondoManiobra: suma(tesoreria) + suma(otrosCorriente) - suma(pasivoCorriente),
    endeudamiento: activo > 0 ? pasivo / activo : null,
    cuadra: Math.abs(activo - pasivo - pn) < 0.05,
  }
}
