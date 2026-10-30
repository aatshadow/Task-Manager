/**
 * /api/finanzas — la única puerta al dinero (LOGICA §17). Función de Vercel.
 *
 * Los datos viven en la Supabase de SYSTEMA (tablas `fin_*`), no en la de GrowthInfo: el
 * navegador nunca la ve. Aquí se comprueba la sesión de 2day (GrowthInfo) y que el email esté
 * en FIN_EMAILS, y se entra con la service key. Las claves de Mercury, Wise y Anthropic sólo
 * viven en este servidor. La v1 sólo LEE de los bancos: nada mueve dinero.
 */
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { resumen, suscripciones, emparejarInternos, aBase, CLASES, porClasificar, casaRegla, patronDe, sentidoDe, opcionesDe, importeOriginal, sumarPaso, RECURRENCIAS } from '../src/datos/finanzasCalculos.js'

export const config = { maxDuration: 300 }

const MODELO = process.env.FINANZAS_MODELO || process.env.OVERVIEW_MODELO || 'claude-opus-5-5'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const FIN_URL = process.env.FIN_SUPABASE_URL
const FIN_KEY = process.env.FIN_SUPABASE_SERVICE_KEY
const EMAILS = (process.env.FIN_EMAILS || 'alex@growthinfo.io').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
const BUCKET = 'finanzas'

// Lo que el navegador puede escribir, tabla por tabla. Lo demás (externo_id, origen de banco,
// saldos de Mercury/Wise, partes, chat) sólo lo escribe este servidor.
const ESCRIBIBLE = {
  fin_ajustes: ['sueldo_dueno', 'colchon_meses', 'impuestos_pct', 'moneda_base', 'listas'],
  fin_cuentas: ['nombre', 'moneda', 'tipo', 'saldo', 'pct_reparto', 'activa', 'orden', 'banco'],
  fin_movimientos: ['cuenta_id', 'fecha', 'importe', 'moneda', 'descripcion', 'contraparte', 'clase', 'categoria', 'negocio', 'estado', 'previsto_id', 'nota'],
  fin_previstos: ['patron', 'tipo', 'titulo', 'importe', 'moneda', 'fecha', 'recurrencia', 'clase', 'categoria', 'negocio', 'suscripcion', 'provisionado', 'estado', 'nota'],
  fin_objetivos: ['titulo', 'importe', 'moneda', 'fecha', 'tipo', 'principal', 'nota'],
  fin_partidas: ['lado', 'plazo', 'cuenta', 'nombre', 'valor', 'valor_origen', 'moneda', 'fecha', 'vencimiento', 'fuente', 'nota', 'activa', 'orden'],
  fin_acciones: ['area', 'titulo', 'detalle', 'prioridad', 'fecha', 'importe_estimado', 'estado', 'origen', 'orden'],
}
const BORRABLE = ['fin_partidas', 'fin_reglas', 'fin_cuentas', 'fin_movimientos', 'fin_previstos', 'fin_objetivos', 'fin_acciones', 'fin_documentos']

async function usuarioDe(token) {
  if (!SUPABASE_URL || !SUPABASE_ANON || !token) return null
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON, authorization: `Bearer ${token}` } })
  return r.ok ? r.json() : null
}

const base = () => createClient(FIN_URL, FIN_KEY, { auth: { persistSession: false } })
const datos = ({ data, error }, que) => { if (error) throw new Error(`${que}: ${error.message}`); return data }
const hoyEn = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10) // Sofía (UTC+3), como el resto de 2day

/* ── tasas del BCE, cacheadas un día ─────────────────────────────────────── */
async function tasas(db, ajustes) {
  const hoy = hoyEn()
  if (ajustes.tasas?.fecha === hoy && ajustes.tasas?.valores) return ajustes.tasas
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=EUR')
    if (!r.ok) throw new Error(String(r.status))
    const j = await r.json()
    const t = { fecha: hoy, valores: { EUR: 1, ...j.rates }, fuente: 'BCE' }
    await db.from('fin_ajustes').update({ tasas: t }).eq('id', 1)
    return t
  } catch {
    return ajustes.tasas?.valores ? ajustes.tasas : { fecha: null, valores: { EUR: 1, USD: 1.08, GBP: 0.85, BGN: 1.95583 }, fuente: 'aproximada' }
  }
}

async function cargarTodo(db) {
  const [aj, cuentas, movimientos, previstos, objetivos, acciones, documentos, partes, chat, reglas, partidas] = await Promise.all([
    db.from('fin_ajustes').select('*').eq('id', 1).maybeSingle(),
    db.from('fin_cuentas').select('*').order('orden').order('created_at'),
    db.from('fin_movimientos').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(2000),
    db.from('fin_previstos').select('*').order('fecha', { nullsFirst: false }),
    db.from('fin_objetivos').select('*').order('principal', { ascending: false }).order('fecha'),
    db.from('fin_acciones').select('*').order('prioridad').order('orden'),
    db.from('fin_documentos').select('*').order('created_at', { ascending: false }),
    db.from('fin_partes').select('*').order('created_at', { ascending: false }).limit(10),
    db.from('fin_chat').select('*').order('created_at', { ascending: false }).limit(60),
    db.from('fin_reglas').select('*').order('created_at', { ascending: false }),
    db.from('fin_partidas').select('*').order('lado').order('orden'),
  ])
  const ajustes = datos(aj, 'ajustes') || { id: 1 }
  ajustes.tasas = await tasas(db, ajustes)
  return {
    ajustes,
    cuentas: datos(cuentas, 'cuentas'),
    movimientos: datos(movimientos, 'movimientos'),
    previstos: datos(previstos, 'previstos'),
    objetivos: datos(objetivos, 'objetivos'),
    acciones: datos(acciones, 'acciones'),
    documentos: datos(documentos, 'documentos'),
    partes: datos(partes, 'partes'),
    chat: datos(chat, 'chat').reverse(),
    reglas: datos(reglas, 'reglas'),
    partidas: datos(partidas, 'partidas'),
    bancos: { mercury: !!process.env.MERCURY_API_TOKEN, wise: !!process.env.WISE_API_TOKEN, whop: !!process.env.WHOP_API_KEY, ia: !!process.env.ANTHROPIC_API_KEY },
    hoy: hoyEn(),
  }
}

/* ── bancos ──────────────────────────────────────────────────────────────── */
async function pedir(url, token) {
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    const e = new Error(`${r.status} ${t.slice(0, 200)}`)
    e.status = r.status
    throw e
  }
  return r.json()
}

async function guardarCuenta(db, fila) {
  return datos(await db.from('fin_cuentas').upsert(fila, { onConflict: 'externo_id' }).select().single(), 'cuenta')
}

async function guardarMovimientos(db, filas) {
  if (!filas.length) return 0
  // la capa de Alex (clase, categoría, nota…) no se pisa: sólo se insertan los nuevos y se
  // refrescan importe/estado/fecha de los que ya estaban
  const ids = filas.map(f => f.externo_id)
  const existentes = datos(await db.from('fin_movimientos').select('id, externo_id').in('externo_id', ids), 'movimientos')
  const ya = new Map(existentes.map(e => [e.externo_id, e.id]))
  const nuevos = filas.filter(f => !ya.has(f.externo_id))
  for (let i = 0; i < nuevos.length; i += 500) datos(await db.from('fin_movimientos').insert(nuevos.slice(i, i + 500)), 'insertar movimientos')
  for (const f of filas.filter(f => ya.has(f.externo_id))) {
    await db.from('fin_movimientos').update({ importe: f.importe, estado: f.estado, fecha: f.fecha }).eq('id', ya.get(f.externo_id))
  }
  return nuevos.length
}

async function sincronizarMercury(db, desde) {
  const token = process.env.MERCURY_API_TOKEN
  if (!token) return { banco: 'mercury', ok: false, error: 'Falta MERCURY_API_TOKEN (Mercury → Settings → API Tokens, de sólo lectura)' }
  const { accounts = [] } = await pedir('https://api.mercury.com/api/v1/accounts', token)
  let nuevos = 0
  for (const a of accounts) {
    const cuenta = await guardarCuenta(db, {
      banco: 'mercury', externo_id: `mercury:${a.id}`, nombre: a.nickname || a.name || 'Mercury', moneda: 'USD',
      saldo: a.currentBalance ?? a.availableBalance ?? 0, saldo_en: new Date().toISOString(),
    })
    const { transactions = [] } = await pedir(`https://api.mercury.com/api/v1/account/${a.id}/transactions?limit=1000&start=${desde}`, token)
    nuevos += await guardarMovimientos(db, transactions.filter(t => !['failed'].includes(t.status)).map(t => ({
      cuenta_id: cuenta.id, externo_id: `mercury:${t.id}`, origen: 'banco',
      fecha: (t.postedAt || t.createdAt || '').slice(0, 10), importe: t.amount, moneda: 'USD',
      descripcion: t.bankDescription || t.note || t.kind || null, contraparte: t.counterpartyName || null,
      estado: t.status === 'cancelled' ? 'cancelado' : t.status === 'pending' ? 'pendiente' : 'hecho',
    })))
  }
  return { banco: 'mercury', ok: true, cuentas: accounts.length, nuevos }
}

async function sincronizarWise(db, desde) {
  const token = process.env.WISE_API_TOKEN
  if (!token) return { banco: 'wise', ok: false, error: 'Falta WISE_API_TOKEN (Wise → Ajustes → Tokens de API, de sólo lectura)' }
  const raiz = 'https://api.transferwise.com'
  const perfiles = await pedir(`${raiz}/v2/profiles`, token)
  const negocio = perfiles.filter(p => String(p.type).toUpperCase() === 'BUSINESS')
  let nuevos = 0
  let cuentas = 0
  const avisos = []
  for (const p of (negocio.length ? negocio : perfiles)) {
    const saldos = await pedir(`${raiz}/v4/profiles/${p.id}/balances?types=STANDARD`, token)
    for (const b of saldos) {
      cuentas++
      const moneda = b.currency || b.amount?.currency
      const cuenta = await guardarCuenta(db, {
        banco: 'wise', externo_id: `wise:${b.id}`, nombre: `Wise ${moneda}${b.name ? ` · ${b.name}` : ''}`, moneda,
        saldo: b.amount?.value ?? 0, saldo_en: new Date().toISOString(),
      })
      try {
        const q = new URLSearchParams({ currency: moneda, intervalStart: `${desde}T00:00:00.000Z`, intervalEnd: new Date().toISOString(), type: 'COMPACT' })
        const ext = await pedir(`${raiz}/v1/profiles/${p.id}/balance-statements/${b.id}/statement.json?${q}`, token)
        // una conversión lleva la MISMA referencia en los dos saldos (sale de EUR, entra en USD),
        // y una referencia puede repetirse dentro del extracto: el id va por saldo y por aparición
        const vistas = new Map()
        nuevos += await guardarMovimientos(db, (ext.transactions || []).map(t => {
          const importe = t.amount?.value ?? 0
          const n = (vistas.get(t.referenceNumber) || 0) + 1
          vistas.set(t.referenceNumber, n)
          return {
            cuenta_id: cuenta.id, externo_id: `wise:${b.id}:${t.referenceNumber}${n > 1 ? `:${n}` : ''}`, origen: 'banco',
            fecha: (t.date || '').slice(0, 10), importe, moneda,
            descripcion: t.details?.description || t.details?.type || null,
            contraparte: t.details?.senderName || t.details?.recipient?.name || t.details?.merchant?.name || null,
            estado: 'hecho',
          }
        }))
      } catch (e) {
        // los perfiles de la UE/Reino Unido piden SCA para el extracto con token personal
        avisos.push(e.status === 403 ? `Wise ${moneda}: el extracto pide verificación reforzada (SCA); hay saldo pero no movimientos` : `Wise ${moneda}: ${e.message}`)
      }
    }
  }
  return { banco: 'wise', ok: true, cuentas, nuevos, avisos }
}

// Whop (Black Phoenix Group): el saldo del ledger es tesorería (caja y bancos, §17.8). Cada pago
// cobrado entra NETO de comisiones (en el concepto va el bruto y el IVA); cada retiro a un banco
// sale como traspaso interno y se empareja con su entrada en Wise o Mercury.
async function sincronizarWhop(db, desde) {
  const token = process.env.WHOP_API_KEY
  const empresa = process.env.WHOP_COMPANY_ID
  if (!token || !empresa) return { banco: 'whop', ok: false, error: 'Falta WHOP_API_KEY y WHOP_COMPANY_ID (Whop → Developer → API key de la empresa)' }
  const raiz = 'https://api.whop.com/api/v1'
  const ledger = await pedir(`${raiz}/ledger_accounts/${empresa}`, token)
  const cuentasPorMoneda = {}
  for (const b of ledger.balances || []) {
    const moneda = String(b.currency || 'usd').toUpperCase()
    cuentasPorMoneda[moneda] = await guardarCuenta(db, {
      banco: 'whop', externo_id: `whop:${ledger.id}:${moneda}`, nombre: `Whop ${moneda}`, moneda,
      saldo: (Number(b.balance) || 0) + (Number(b.pending_balance) || 0) + (Number(b.reserve_balance) || 0), saldo_en: new Date().toISOString(),
    })
  }
  const cuentaDe = async (moneda) => cuentasPorMoneda[moneda] || (cuentasPorMoneda[moneda] = await guardarCuenta(db, {
    banco: 'whop', externo_id: `whop:${ledger.id}:${moneda}`, nombre: `Whop ${moneda}`, moneda, saldo: 0, saldo_en: new Date().toISOString(),
  }))
  const todos = async (ruta) => {
    const fuera = []
    let despues = null
    for (let i = 0; i < 50; i++) {
      const j = await pedir(`${raiz}/${ruta}&first=100${despues ? `&after=${encodeURIComponent(despues)}` : ''}`, token)
      fuera.push(...(j.data || []))
      if (!j.page_info?.has_next_page || !j.page_info?.end_cursor) break
      despues = j.page_info.end_cursor
    }
    return fuera
  }
  const dinero = (x) => (x && typeof x === 'object' ? Number(x.amount) || 0 : Number(x) || 0)
  const filas = []
  for (const p of await todos(`payments?account_id=${empresa}`)) {
    const fecha = (p.paid_at || p.created_at || '').slice(0, 10)
    if (p.status !== 'paid' || fecha < desde) continue
    const moneda = String(p.currency || 'usd').toUpperCase()
    const cuenta = await cuentaDe(moneda)
    const producto = p.line_items?.[0]?.product_title || 'Whop'
    filas.push({
      cuenta_id: cuenta.id, externo_id: `whop:${p.id}`, origen: 'banco', fecha, moneda, estado: 'hecho',
      importe: dinero(p.amount_after_fees),
      descripcion: `Cobro Whop · ${producto} · bruto ${dinero(p.total)} ${moneda}${dinero(p.tax_amount) ? `, IVA ${dinero(p.tax_amount)}` : ''}, neto de comisiones`,
      contraparte: p.user?.name || p.user?.username || null,
    })
    const devuelto = dinero(p.refunded_amount)
    if (devuelto > 0) filas.push({ cuenta_id: cuenta.id, externo_id: `whop:${p.id}:devolucion`, origen: 'banco', fecha, moneda, estado: 'hecho', importe: -devuelto, descripcion: `Devolución Whop · ${producto}`, contraparte: p.user?.name || null })
  }
  for (const r of await todos(`payouts?account_id=${empresa}`)) {
    const fecha = (r.created_at || r.paid_at || '').slice(0, 10)
    if (!fecha || fecha < desde || ['failed', 'canceled', 'cancelled'].includes(r.status)) continue
    const moneda = String(r.currency || r.amount?.currency || 'usd').toUpperCase()
    const cuenta = await cuentaDe(moneda)
    filas.push({ cuenta_id: cuenta.id, externo_id: `whop:${r.id}`, origen: 'banco', fecha, moneda, estado: r.status === 'paid' || r.status === 'completed' ? 'hecho' : 'pendiente', importe: -Math.abs(dinero(r.amount ?? r.total)), descripcion: 'Retiro de Whop a banco', contraparte: 'Whop' })
  }
  const nuevos = await guardarMovimientos(db, filas)
  return { banco: 'whop', ok: true, cuentas: Object.keys(cuentasPorMoneda).length, nuevos }
}

async function sincronizar(db) {
  const desde = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10)
  const resultados = []
  for (const [banco, f] of [['mercury', sincronizarMercury], ['wise', sincronizarWise], ['whop', sincronizarWhop]]) {
    try { resultados.push(await f(db, desde)) } catch (e) { resultados.push({ banco, ok: false, error: e.message }) }
  }
  // transferencias Wise → Mercury: ni ingreso ni gasto
  const cuentas = datos(await db.from('fin_cuentas').select('id, banco'), 'cuentas')
  const movs = datos(await db.from('fin_movimientos').select('id, cuenta_id, importe, moneda, fecha, origen, emparejado_id').eq('origen', 'banco').is('emparejado_id', null), 'movimientos')
  const pares = emparejarInternos(movs, cuentas)
  for (const [s, e] of pares) {
    const interno = { clase: 'interno', categoria: 'Transferencia interna', clasificado_por: 'regla', sugerencia: null }
    await db.from('fin_movimientos').update({ ...interno, emparejado_id: e.id }).eq('id', s.id)
    await db.from('fin_movimientos').update({ ...interno, emparejado_id: s.id }).eq('id', e.id)
  }
  // lo nuevo se clasifica solo: primero las reglas de Alex, luego la IA
  let clasificacion = null
  try { clasificacion = await clasificar(db) } catch (e) { clasificacion = { error: e.message } }
  const sync = { en: new Date().toISOString(), resultados, internos: pares.length, clasificacion }
  await db.from('fin_ajustes').update({ sync }).eq('id', 1)
  return sync
}

// quién es Alex: lo comparten el clasificador y el asesor
const PERFIL = `Alex: fundador de CORE (consultoría de sistemas para negocios online: EasyBiz, Izibizz, ScaleInfo, clientes como SociosEcom o Gemelos), trader sistemático, 25 años.
Empresa: LLC de EE. UU. (Black Phoenix Group LLC, disregarded entity). Cobra por Wise, pasa a Mercury y reparte por pockets.
Residencia fiscal: Bulgaria en 2026 (10 %), Paraguay desde 2027 (no pasará >183 días en ningún país). PENDIENTE Y PRIORITARIO: regularizar España (2025 y anteriores sin declarar): ir por delante cuesta recargos ≤15 %; si lo detecta Hacienda, sanciones del 50–150 %.
La Misión: 520.424,26 € en la caja de la empresa el 16-09-2027.
Diseño humano: Proyector, autoridad emocional: las decisiones grandes (> 2.000 €) con al menos una noche de margen; lo pequeño, rápido.`

/* ── clasificar solo (LOGICA §17.5) ──────────────────────────────────────── */
// Orden: 1) las reglas que Alex ha enseñado («siempre igual») 2) la IA, con lo que Alex ya
// clasificó como ejemplos. La IA sólo aplica lo que tiene claro (confianza ≥ UMBRAL); lo
// dudoso se queda en «Por clasificar» con su propuesta para que Alex lo acepte de un toque.
const UMBRAL = 0.8
const LOTE = 120

const Clasificacion = z.object({
  movimientos: z.array(z.object({
    n: z.number().int().describe('El número del movimiento en la lista.'),
    clase: z.enum(CLASES.map(c => c.valor)),
    categoria: z.string().describe('Una de las categorías de la lista, tal cual.'),
    negocio: z.string().nullable().describe('Uno de los negocios de la lista, o null si no se sabe.'),
    confianza: z.number().describe('0 a 1: lo seguro que estás.'),
    motivo: z.string().describe('Máx. 12 palabras: por qué.'),
    suscripcion: z.boolean().describe('true si es el cobro periódico de un servicio (SaaS, plan, alquiler de máquina…).'),
    recurrencia: z.enum(['mensual', 'anual']).nullable().describe('Cada cuánto se cobra, si es suscripción.'),
  })),
})

const sistemaClasificar = (op) => `Clasificas los movimientos bancarios de Alex para su app de finanzas.
${PERFIL}

Clases (para gastos): obligatorio = hay que pagarlo sí o sí (impuestos, herramientas de las que vive el negocio, vivienda, comisiones); recortable = útil pero se puede quitar o bajar (suscripciones prescindibles); libre = gasto personal discrecional (ocio, comida fuera, caprichos, efectivo sin destino conocido); inversion = compra de activos o formación que rinde. Para entradas: ingreso = cobro real (clientes, afiliados, intereses); interno = no es ni ingreso ni gasto (reembolsos que anulan un cargo, verificaciones de tarjeta de ida y vuelta, recargas entre cuentas propias).
Categorías de gasto: ${op.gasto.join(', ')}.
Categorías de entrada: ${op.ingreso.join(', ')}. Usa «Reembolsos» con clase interno para devoluciones y verificaciones.
Negocios: ${op.negocios.join(', ')}. Herramientas de IA, vídeo y software (Anthropic, HeyGen, ElevenLabs, Higgsfield, Vercel, Cloudflare, Rentamac…) son del negocio: CORE salvo que el texto diga otra cosa. Si no se sabe, null.
Los retiros en cajero (ATM) son «Efectivo», clase libre, confianza ≤ 0,7: Alex debe decir para qué fue.
Sé honesto con la confianza: si dudas entre dos categorías, baja de ${UMBRAL}. Usa las clasificaciones previas de Alex como ley.
Suscripción = cargo periódico de un servicio (herramientas de IA y software, hosting, planes de cuenta, alquiler de una máquina): marca suscripcion true y su recurrencia. Una compra suelta, un vuelo o un cajero no lo son.`

// Una suscripción es un previsto recurrente (§17.6). Al ver uno de sus cargos: se busca la que
// ya existe (por patrón, por título o por importe) y se le engancha el cargo; si no hay, se crea
// con el próximo cobro a un periodo del cargo. La fecha del previsto es siempre «la próxima».
async function suscribir(db, m, { recurrencia = 'mensual', clase, categoria, negocio }) {
  const patron = patronDe(m)
  if (!patron) return null
  const { importe, moneda } = importeOriginal(m)
  const siguiente = sumarPaso(m.fecha, recurrencia)
  const subs = datos(await db.from('fin_previstos').select('*').eq('suscripcion', true).neq('estado', 'cancelado'), 'suscripciones')
  const primera = patron.split(/[\s*._-]+/).find(w => w.length >= 4) || patron
  const s = subs.find(x => x.patron && (patron.includes(x.patron) || x.patron.includes(patron)))
    || subs.find(x => `${x.titulo} ${x.nota || ''}`.toLowerCase().includes(primera))
    || subs.find(x => x.moneda === moneda && Math.abs(Number(x.importe) - importe) <= importe * 0.02 && (x.categoria || '') === (categoria || ''))
  let previsto
  if (s) {
    const cambio = { patron: s.patron || patron }
    if (!s.fecha || s.fecha <= m.fecha) cambio.fecha = sumarPaso(m.fecha, s.recurrencia || recurrencia)
    if (s.importe == null) Object.assign(cambio, { importe, moneda })
    previsto = datos(await db.from('fin_previstos').update(cambio).eq('id', s.id).select().single(), 'suscripción')
  } else {
    const titulo = (m.contraparte || m.descripcion || 'Suscripción').replace(/\*.*$/, '').replace(/\b(inc|llc|ltd|technology)\.?$/i, '').replace(/[\s,.]+$/, '').trim()
    previsto = datos(await db.from('fin_previstos').insert({
      tipo: 'gasto', titulo, importe, moneda, fecha: siguiente, recurrencia, suscripcion: true, patron,
      clase: clase || 'recortable', categoria, negocio, estado: 'previsto', provisionado: 0,
    }).select().single(), 'nueva suscripción')
  }
  await db.from('fin_movimientos').update({ previsto_id: previsto.id }).eq('id', m.id)
  return previsto
}

async function clasificar(db) {
  const [reglas, ajustes, todos, previstos] = await Promise.all([
    db.from('fin_reglas').select('*').then(r => datos(r, 'reglas')),
    db.from('fin_ajustes').select('listas').eq('id', 1).maybeSingle().then(r => datos(r, 'ajustes') || {}),
    db.from('fin_movimientos').select('*').order('fecha', { ascending: false }).limit(2000).then(r => datos(r, 'movimientos')),
    db.from('fin_previstos').select('tipo, categoria, negocio').then(r => datos(r, 'previstos')),
  ])
  const op = opcionesDe({ ajustes, movimientos: todos, previstos })
  const pend = todos.filter(m => !m.clasificado_por && porClasificar(m)).sort((a, b) => a.fecha.localeCompare(b.fecha))
  let porRegla = 0
  let subs = 0
  const resto = []
  const usadas = new Map()
  for (const m of pend) {
    const r = reglas.find(x => casaRegla(m, x))
    if (!r) { resto.push(m); continue }
    await db.from('fin_movimientos').update({ clase: r.clase, categoria: r.categoria, negocio: r.negocio || m.negocio, clasificado_por: 'regla', sugerencia: null }).eq('id', m.id)
    if (r.suscripcion && m.importe < 0 && !m.previsto_id) { await suscribir(db, m, { ...r, recurrencia: r.recurrencia || 'mensual' }); subs++ }
    usadas.set(r.id, (usadas.get(r.id) || 0) + 1)
    porRegla++
  }
  for (const [id, n] of usadas) await db.from('fin_reglas').update({ aplicada: (reglas.find(r => r.id === id).aplicada || 0) + n }).eq('id', id)
  if (!resto.length || !process.env.ANTHROPIC_API_KEY) return { reglas: porRegla, ia: 0, dudas: resto.length, suscripciones: subs }

  const ejemplos = todos.filter(m => m.clasificado_por === 'alex').slice(0, 40)
  const linea = (m) => `${m.importe} ${m.moneda} | ${m.contraparte || '-'} | ${(m.descripcion || '').slice(0, 90)}`
  const client = new Anthropic()
  let ia = 0
  let dudas = 0
  for (let i = 0; i < resto.length; i += LOTE) {
    const lote = resto.slice(i, i + LOTE)
    const r = await client.messages.parse({
      model: MODELO,
      max_tokens: 16000,
      output_config: { effort: 'low', format: zodOutputFormat(Clasificacion) },
      system: sistemaClasificar(op),
      messages: [{
        role: 'user',
        content: `${ejemplos.length ? `ASÍ CLASIFICA ALEX (importe | contraparte | concepto → clase, categoría, negocio):\n${ejemplos.map(e => `${linea(e)} → ${e.clase}, ${e.categoria}, ${e.negocio || '-'}${e.previsto_id ? ', suscripción' : ''}`).join('\n')}\n\n` : ''}CLASIFICA ESTOS (n | importe | contraparte | concepto), del más antiguo al más reciente:\n${lote.map((m, n) => `${n} | ${linea(m)}`).join('\n')}`,
      }],
    })
    for (const c of r.parsed_output?.movimientos || []) {
      const m = lote[c.n]
      if (!m) continue
      const negocio = op.negocios.includes(c.negocio) ? c.negocio : null
      const suscripcion = c.suscripcion && m.importe < 0
      const sugerencia = { clase: c.clase, categoria: c.categoria, negocio, confianza: c.confianza, motivo: c.motivo, suscripcion, recurrencia: suscripcion ? c.recurrencia || 'mensual' : null }
      const seguro = c.confianza >= UMBRAL
      await db.from('fin_movimientos').update(seguro
        ? { clase: c.clase, categoria: c.categoria, negocio: negocio || m.negocio, clasificado_por: 'ia', sugerencia }
        : { sugerencia }).eq('id', m.id)
      if (seguro && suscripcion && !m.previsto_id) { await suscribir(db, m, { ...sugerencia, negocio: negocio || m.negocio }); subs++ }
      if (seguro) ia++
      else dudas++
    }
  }
  return { reglas: porRegla, ia, dudas, suscripciones: subs }
}

/**
 * Alex clasifica uno. Con `siempre`, 2day aprende la regla y la aplica a todo lo parecido que no
 * tocó él. Con `suscripcion`, el cargo (y sus parecidos) se enganchan a su suscripción.
 */
async function clasificarUno(db, { id, clase, categoria, negocio, siempre, suscripcion, recurrencia }) {
  const m = datos(await db.from('fin_movimientos').select('*').eq('id', id).maybeSingle(), 'movimiento')
  if (!m) throw new Error('No existe ese movimiento')
  const rec = RECURRENCIAS.some(r => r.valor && r.valor === recurrencia) ? recurrencia : 'mensual'
  const cambio = { clase: clase || null, categoria: categoria || null, negocio: negocio || null, clasificado_por: 'alex', sugerencia: null }
  datos(await db.from('fin_movimientos').update(cambio).eq('id', id), 'clasificar')
  const sub = suscripcion && m.importe < 0 ? await suscribir(db, m, { ...cambio, recurrencia: rec }) : null
  if (!siempre) return { iguales: 0, suscripcion: sub?.titulo || null }
  const patron = patronDe(m)
  if (!patron) return { iguales: 0, suscripcion: sub?.titulo || null }
  const regla = datos(await db.from('fin_reglas').upsert({
    patron, sentido: sentidoDe(m), clase: cambio.clase, categoria: cambio.categoria, negocio: cambio.negocio,
    suscripcion: !!sub, recurrencia: sub ? rec : null,
  }, { onConflict: 'patron,sentido' }).select().single(), 'regla')
  const otros = datos(await db.from('fin_movimientos').select('id, contraparte, descripcion, importe, clasificado_por').neq('id', id), 'parecidos')
    .filter(x => x.clasificado_por !== 'alex' && casaRegla(x, regla))
  const cambioOtros = { clase: cambio.clase, categoria: cambio.categoria, negocio: cambio.negocio, clasificado_por: 'regla', sugerencia: null }
  for (const x of otros) await db.from('fin_movimientos').update(sub ? { ...cambioOtros, previsto_id: sub.id } : cambioOtros).eq('id', x.id)
  await db.from('fin_reglas').update({ aplicada: (regla.aplicada || 0) + otros.length }).eq('id', regla.id)
  return { iguales: otros.length, patron, suscripcion: sub?.titulo || null }
}

/** Desde la ficha de un movimiento ya clasificado: «esto es una suscripción». */
async function marcarSuscripcion(db, { id, recurrencia }) {
  const m = datos(await db.from('fin_movimientos').select('*').eq('id', id).maybeSingle(), 'movimiento')
  if (!m) throw new Error('No existe ese movimiento')
  if (m.importe >= 0) throw new Error('Sólo un cargo puede ser una suscripción')
  const sub = await suscribir(db, m, { recurrencia: recurrencia || 'mensual', clase: m.clase, categoria: m.categoria, negocio: m.negocio })
  // los demás cargos del mismo servicio cuelgan de ella
  const patron = patronDe(m)
  const otros = datos(await db.from('fin_movimientos').select('id, contraparte, descripcion, importe').is('previsto_id', null).lt('importe', 0), 'parecidos')
    .filter(x => casaRegla(x, { patron, sentido: 'gasto' }))
  for (const x of otros) await db.from('fin_movimientos').update({ previsto_id: sub.id }).eq('id', x.id)
  return { suscripcion: sub }
}

/* ── el asesor ───────────────────────────────────────────────────────────── */

const SISTEMA_PARTE = `Eres el asesor financiero personal de Alex dentro de 2day: un gestor de patrimonio de primer nivel cuyo trabajo es que, si Alex te hace caso al 100 %, su patrimonio crezca y llegue a la Misión.
${PERFIL}

Te llega el estado de sus finanzas en JSON (todo en EUR salvo que se diga), con el «hoy puedes gastar» ya calculado por la fórmula de 2day (no lo recalcules: úsalo). Escribe el parte del día:
- Español, directo, tuteando, sin humo ni motivación vacía. Cada afirmación se apoya en un número del JSON.
- Di claramente qué se gasta sí o sí, qué se puede ahorrar o recortar, cuánto puede gastar libre hoy y qué conviene invertir o apartar.
- Si faltan datos (sin bancos conectados, previstos sin importe, sin sueldo fijado), dilo y pídelos en «falta_saber»; no inventes cifras.
- Vigila el plan de acción: si hay algo fiscal o de residencia urgente, ponlo en avisos.
- Las acciones nuevas que propongas no deben repetir las que ya están en el plan.`

const Parte = z.object({
  titular: z.string().describe('Una frase: el estado del dinero hoy.'),
  semaforo: z.enum(['verde', 'ambar', 'rojo']),
  lectura: z.string().describe('3-5 frases con números: dónde estamos y a dónde vamos.'),
  consejos: z.array(z.object({
    tipo: z.enum(['obligatorio', 'gasta', 'ahorra', 'invierte', 'aviso']),
    texto: z.string(),
    importe: z.number().nullable().describe('En EUR, si aplica.'),
  })).describe('4-8 consejos para hoy, ordenados por importancia.'),
  acciones: z.array(z.object({
    area: z.enum(['fiscal', 'residencia', 'bancos', 'finanzas', 'inversion']),
    titulo: z.string(),
    detalle: z.string(),
    prioridad: z.number().int().describe('1 alta, 2 media, 3 baja'),
  })).describe('0-3 acciones NUEVAS para el plan; vacío si no hace falta ninguna.'),
  falta_saber: z.array(z.string()).describe('Datos que necesitas de Alex para afinar.'),
})

function contexto(t) {
  const r = resumen(t)
  const s = suscripciones(t.previstos, t.ajustes.tasas?.valores)
  const tasasV = t.ajustes.tasas?.valores
  return {
    hoy: t.hoy,
    resumen: { ...r, proximos: r.proximos.slice(0, 20).map(p => ({ titulo: p.titulo, tipo: p.tipo, cae: p.cae, eur: Math.round(p.base) })), sinImporte: r.sinImporte.map(p => p.titulo) },
    bancos_conectados: t.bancos,
    cuentas: t.cuentas.map(c => ({ nombre: c.nombre, banco: c.banco, tipo: c.tipo, moneda: c.moneda, saldo: c.saldo, eur: Math.round(aBase(c.saldo, c.moneda, tasasV)) })),
    ajustes: { sueldo_dueno: t.ajustes.sueldo_dueno, tasas: t.ajustes.tasas?.fuente },
    balance: t.partidas.map(p => ({ nombre: p.nombre, lado: p.lado, plazo: p.plazo, cuenta: p.cuenta, valor: p.valor, moneda: p.moneda, vencimiento: p.vencimiento })),
    objetivos: t.objetivos.map(o => ({ titulo: o.titulo, importe: o.importe, fecha: o.fecha, tipo: o.tipo, principal: o.principal })),
    previstos: t.previstos.filter(p => p.estado === 'previsto').map(p => ({ titulo: p.titulo, tipo: p.tipo, importe: p.importe, moneda: p.moneda, fecha: p.fecha, recurrencia: p.recurrencia, clase: p.clase, provisionado: p.provisionado, suscripcion: p.suscripcion })),
    suscripciones: { mensual_eur: Math.round(s.mensual), anual_eur: Math.round(s.anual) },
    plan_de_accion: t.acciones.map(a => ({ area: a.area, titulo: a.titulo, estado: a.estado, prioridad: a.prioridad })),
    ultimos_movimientos: t.movimientos.slice(0, 60).map(m => ({ fecha: m.fecha, importe: m.importe, moneda: m.moneda, desc: m.contraparte || m.descripcion, clase: m.clase, categoria: m.categoria })),
  }
}

function errorAnthropic(res, e) {
  if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Claude está saturado; prueba en un minuto' })
  if (e instanceof Anthropic.AuthenticationError) return res.status(502).json({ error: 'La clave de Anthropic del servidor no vale' })
  if (e instanceof Anthropic.APIError) return res.status(502).json({ error: `Anthropic ${e.status}: ${e.message}` })
  return res.status(500).json({ error: e?.message || 'Error del asesor' })
}

async function parte(db, res) {
  const t = await cargarTodo(db)
  const client = new Anthropic()
  try {
    const r = await client.messages.parse({
      model: MODELO,
      max_tokens: 12000,
      output_config: { effort: 'high', format: zodOutputFormat(Parte) },
      system: SISTEMA_PARTE,
      messages: [{ role: 'user', content: `ESTADO DE LAS FINANZAS (${t.hoy}):\n${JSON.stringify(contexto(t))}` }],
    })
    if (r.stop_reason === 'refusal') return res.status(502).json({ error: 'Claude declinó escribir el parte' })
    if (!r.parsed_output) return res.status(502).json({ error: 'El parte llegó incompleto; vuelve a intentarlo' })
    const fila = datos(await db.from('fin_partes').insert({ fecha: t.hoy, parte: r.parsed_output, modelo: r.model }).select().single(), 'guardar parte')
    return res.status(200).json({ parte: fila })
  } catch (e) { return errorAnthropic(res, e) }
}

async function preguntar(db, res, pregunta) {
  if (!pregunta?.trim()) return res.status(400).json({ error: 'Falta la pregunta' })
  const t = await cargarTodo(db)
  const historia = t.chat.slice(-12).map(m => ({ role: m.rol === 'alex' ? 'user' : 'assistant', content: m.texto }))
  // la API exige alternancia empezando por el usuario
  while (historia.length && historia[0].role !== 'user') historia.shift()
  const sistema = `${SISTEMA_PARTE.split('\n\nTe llega')[0]}

Ahora Alex te pregunta en un chat. Responde corto (máx. ~150 palabras), con números de su estado. Si pregunta «¿me lo puedo permitir?»: di sí o no, de qué partida sale, cuántos días retrasa la Misión (importe ÷ ritmo neto diario) y, si pasa de 2.000 €, recomiéndale dormirlo una noche.

ESTADO (${t.hoy}):
${JSON.stringify(contexto(t))}`
  const client = new Anthropic()
  try {
    const r = await client.messages.create({
      model: MODELO,
      max_tokens: 4000,
      output_config: { effort: 'medium' },
      system: sistema,
      messages: [...historia, { role: 'user', content: pregunta.trim() }],
    })
    const texto = r.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
    if (!texto) return res.status(502).json({ error: 'El asesor no respondió nada' })
    datos(await db.from('fin_chat').insert([{ rol: 'alex', texto: pregunta.trim() }]), 'guardar pregunta')
    datos(await db.from('fin_chat').insert([{ rol: 'asesor', texto }]), 'guardar respuesta')
    return res.status(200).json({ texto })
  } catch (e) { return errorAnthropic(res, e) }
}

/* ── la puerta ───────────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Sólo POST' })
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const usuario = await usuarioDe(token)
  if (!usuario?.id) return res.status(401).json({ error: 'Sesión no válida' })
  if (!EMAILS.includes(String(usuario.email || '').toLowerCase())) return res.status(403).json({ error: 'Las finanzas son sólo de Alex' })
  if (!FIN_URL || !FIN_KEY) return res.status(503).json({ error: 'Faltan FIN_SUPABASE_URL y FIN_SUPABASE_SERVICE_KEY en el servidor' })

  const db = base()
  const { accion, tabla, fila, id, pregunta } = req.body || {}
  try {
    switch (accion) {
      case 'cargar':
        return res.status(200).json(await cargarTodo(db))

      case 'guardar': {
        const columnas = ESCRIBIBLE[tabla]
        if (!columnas) return res.status(400).json({ error: `No se escribe en ${tabla}` })
        const limpia = Object.fromEntries(Object.entries(fila || {}).filter(([k]) => columnas.includes(k)))
        if (tabla === 'fin_ajustes') {
          return res.status(200).json({ fila: datos(await db.from('fin_ajustes').update({ ...limpia, updated_at: new Date().toISOString() }).eq('id', 1).select().single(), 'ajustes') })
        }
        if (tabla === 'fin_cuentas' && !fila?.id) limpia.banco = 'manual'
        if (tabla === 'fin_partidas' && !fila?.id && limpia.valor_origen == null) limpia.valor_origen = limpia.valor
        if (tabla === 'fin_cuentas' && 'saldo' in limpia) limpia.saldo_en = new Date().toISOString()
        // lo que Alex clasifica a mano es ley: ni las reglas ni la IA lo vuelven a tocar
        if (tabla === 'fin_movimientos' && ('clase' in limpia || 'categoria' in limpia)) Object.assign(limpia, { clasificado_por: 'alex', sugerencia: null })
        if (tabla === 'fin_objetivos' && limpia.principal) await db.from('fin_objetivos').update({ principal: false }).neq('id', fila?.id || '00000000-0000-0000-0000-000000000000')
        const q = fila?.id
          ? db.from(tabla).update(limpia).eq('id', fila.id)
          : db.from(tabla).insert(tabla === 'fin_movimientos' ? { ...limpia, origen: 'manual' } : limpia)
        return res.status(200).json({ fila: datos(await q.select().single(), `guardar en ${tabla}`) })
      }

      case 'borrar': {
        if (!BORRABLE.includes(tabla) || !id) return res.status(400).json({ error: 'No se puede borrar eso' })
        if (tabla === 'fin_documentos') {
          const d = datos(await db.from('fin_documentos').select('ruta').eq('id', id).maybeSingle(), 'documento')
          if (d?.ruta) await db.storage.from(BUCKET).remove([d.ruta])
        }
        datos(await db.from(tabla).delete().eq('id', id), `borrar de ${tabla}`)
        return res.status(200).json({ ok: true })
      }

      case 'sincronizar':
        return res.status(200).json(await sincronizar(db))

      case 'clasificar':
        return res.status(200).json(await clasificar(db))

      case 'clasificarUno':
        return res.status(200).json(await clasificarUno(db, req.body))

      case 'suscripcion':
        return res.status(200).json(await marcarSuscripcion(db, req.body))

      case 'subir': {
        const { nombre, tipo, base64, movimientoId, previstoId } = req.body
        if (!base64 || !nombre || (!movimientoId && !previstoId)) return res.status(400).json({ error: 'Falta el fichero o a qué va enlazado' })
        const ruta = `${new Date().toISOString().slice(0, 7)}/${Date.now()}-${nombre.replace(/[^\w.-]+/g, '_')}`
        const { error } = await db.storage.from(BUCKET).upload(ruta, Buffer.from(base64, 'base64'), { contentType: tipo || 'application/octet-stream' })
        if (error) throw new Error(`subir: ${error.message}`)
        const doc = datos(await db.from('fin_documentos').insert({ ruta, nombre, tipo, movimiento_id: movimientoId || null, previsto_id: previstoId || null }).select().single(), 'documento')
        return res.status(200).json({ documento: doc })
      }

      case 'enlace': {
        const d = datos(await db.from('fin_documentos').select('ruta').eq('id', id).maybeSingle(), 'documento')
        if (!d) return res.status(404).json({ error: 'No existe ese documento' })
        const { data, error } = await db.storage.from(BUCKET).createSignedUrl(d.ruta, 600)
        if (error) throw new Error(error.message)
        return res.status(200).json({ url: data.signedUrl })
      }

      case 'parte':
        if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Falta ANTHROPIC_API_KEY en el servidor' })
        return await parte(db, res)

      case 'preguntar':
        if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Falta ANTHROPIC_API_KEY en el servidor' })
        return await preguntar(db, res, pregunta)

      default:
        return res.status(400).json({ error: `Acción desconocida: ${accion}` })
    }
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Error en finanzas' })
  }
}
