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
import { resumen, suscripciones, emparejarInternos, aBase } from '../src/datos/finanzasCalculos.js'

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
  fin_ajustes: ['sueldo_dueno', 'colchon_meses', 'impuestos_pct', 'moneda_base'],
  fin_cuentas: ['nombre', 'moneda', 'tipo', 'saldo', 'pct_reparto', 'activa', 'orden', 'banco'],
  fin_movimientos: ['cuenta_id', 'fecha', 'importe', 'moneda', 'descripcion', 'contraparte', 'clase', 'categoria', 'negocio', 'estado', 'previsto_id', 'nota'],
  fin_previstos: ['tipo', 'titulo', 'importe', 'moneda', 'fecha', 'recurrencia', 'clase', 'categoria', 'negocio', 'suscripcion', 'provisionado', 'estado', 'nota'],
  fin_objetivos: ['titulo', 'importe', 'moneda', 'fecha', 'tipo', 'principal', 'nota'],
  fin_acciones: ['area', 'titulo', 'detalle', 'prioridad', 'fecha', 'importe_estimado', 'estado', 'origen', 'orden'],
}
const BORRABLE = ['fin_cuentas', 'fin_movimientos', 'fin_previstos', 'fin_objetivos', 'fin_acciones', 'fin_documentos']

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
  const [aj, cuentas, movimientos, previstos, objetivos, acciones, documentos, partes, chat] = await Promise.all([
    db.from('fin_ajustes').select('*').eq('id', 1).maybeSingle(),
    db.from('fin_cuentas').select('*').order('orden').order('created_at'),
    db.from('fin_movimientos').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(2000),
    db.from('fin_previstos').select('*').order('fecha', { nullsFirst: false }),
    db.from('fin_objetivos').select('*').order('principal', { ascending: false }).order('fecha'),
    db.from('fin_acciones').select('*').order('prioridad').order('orden'),
    db.from('fin_documentos').select('*').order('created_at', { ascending: false }),
    db.from('fin_partes').select('*').order('created_at', { ascending: false }).limit(10),
    db.from('fin_chat').select('*').order('created_at', { ascending: false }).limit(60),
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
    bancos: { mercury: !!process.env.MERCURY_API_TOKEN, wise: !!process.env.WISE_API_TOKEN, ia: !!process.env.ANTHROPIC_API_KEY },
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
      clase: t.amount > 0 ? 'ingreso' : null,
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
        nuevos += await guardarMovimientos(db, (ext.transactions || []).map(t => {
          const importe = t.amount?.value ?? 0
          return {
            cuenta_id: cuenta.id, externo_id: `wise:${t.referenceNumber}`, origen: 'banco',
            fecha: (t.date || '').slice(0, 10), importe, moneda,
            descripcion: t.details?.description || t.details?.type || null,
            contraparte: t.details?.senderName || t.details?.recipient?.name || t.details?.merchant?.name || null,
            clase: importe > 0 ? 'ingreso' : null, estado: 'hecho',
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

async function sincronizar(db) {
  const desde = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10)
  const resultados = []
  for (const f of [sincronizarMercury, sincronizarWise]) {
    try { resultados.push(await f(db, desde)) } catch (e) { resultados.push({ banco: f === sincronizarMercury ? 'mercury' : 'wise', ok: false, error: e.message }) }
  }
  // transferencias Wise → Mercury: ni ingreso ni gasto
  const cuentas = datos(await db.from('fin_cuentas').select('id, banco'), 'cuentas')
  const movs = datos(await db.from('fin_movimientos').select('id, cuenta_id, importe, moneda, fecha, origen, emparejado_id').eq('origen', 'banco').is('emparejado_id', null), 'movimientos')
  const pares = emparejarInternos(movs, cuentas)
  for (const [s, e] of pares) {
    await db.from('fin_movimientos').update({ clase: 'interno', emparejado_id: e.id }).eq('id', s.id)
    await db.from('fin_movimientos').update({ clase: 'interno', emparejado_id: s.id }).eq('id', e.id)
  }
  const sync = { en: new Date().toISOString(), resultados, internos: pares.length }
  await db.from('fin_ajustes').update({ sync }).eq('id', 1)
  return sync
}

/* ── el asesor ───────────────────────────────────────────────────────────── */
const PERFIL = `Alex: fundador de CORE (consultoría de sistemas para negocios online: EasyBiz, Izibizz, ScaleInfo, clientes como SociosEcom o Gemelos), trader sistemático, 25 años.
Empresa: LLC de EE. UU. (Black Phoenix Group LLC, disregarded entity). Cobra por Wise, pasa a Mercury y reparte por pockets.
Residencia fiscal: Bulgaria en 2026 (10 %), Paraguay desde 2027 (no pasará >183 días en ningún país). PENDIENTE Y PRIORITARIO: regularizar España (2025 y anteriores sin declarar): ir por delante cuesta recargos ≤15 %; si lo detecta Hacienda, sanciones del 50–150 %.
La Misión: 520.424,26 € en la caja de la empresa el 16-09-2027.
Diseño humano: Proyector, autoridad emocional: las decisiones grandes (> 2.000 €) con al menos una noche de margen; lo pequeño, rápido.`

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
    ajustes: { sueldo_dueno: t.ajustes.sueldo_dueno, colchon_meses: t.ajustes.colchon_meses, impuestos_pct: t.ajustes.impuestos_pct, tasas: t.ajustes.tasas?.fuente },
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
        if (tabla === 'fin_cuentas' && 'saldo' in limpia) limpia.saldo_en = new Date().toISOString()
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
