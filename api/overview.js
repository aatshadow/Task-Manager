/**
 * /api/overview — la ficha IA del Overview (LOGICA §13). Función de Vercel.
 *
 * Recibe las métricas que calcula el navegador (`src/datos/overview.js`) y, si la hay, la
 * ficha anterior; devuelve la ficha nueva escrita por Claude con forma fija (zod). No guarda
 * nada: la fila la inserta el navegador en `hoy_overview`, bajo su RLS. La clave de
 * Anthropic sólo vive aquí (ANTHROPIC_API_KEY en Vercel), nunca en el bundle.
 *
 * Sólo responde a una sesión válida de Supabase: el token del navegador se comprueba contra
 * `/auth/v1/user` antes de gastar un céntimo.
 */
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

export const config = { maxDuration: 300 }

const MODELO = process.env.OVERVIEW_MODELO || 'claude-opus-5-5'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

const CLAVES = ['consistencia', 'ejecucion', 'foco', 'planificacion', 'carga', 'habitos', 'cuerpo', 'frentes']

const Ficha = z.object({
  titular: z.string().describe('Una frase que resume el momento, como un titular. Sin humo.'),
  resumen: z.string().describe('3-5 frases: qué está pasando, con números.'),
  nota_global: z.number().describe('0-100. Provisional si hay pocos días de datos.'),
  confianza: z.enum(['baja', 'media', 'alta']).describe('Cuánto dato hay detrás de la lectura.'),
  perfil: z.object({
    arquetipo: z.string().describe('2-4 palabras, como la clase de un personaje.'),
    descripcion: z.string(),
    fortalezas: z.array(z.string()),
    puntos_ciegos: z.array(z.string()),
  }),
  dimensiones: z.array(z.object({
    clave: z.enum(CLAVES),
    nota: z.number().describe('0-10, admite medios puntos.'),
    lectura: z.string().describe('Una o dos frases con el porqué, citando el dato.'),
  })).describe('Exactamente una entrada por cada clave, en el orden dado.'),
  tiempo: z.object({
    lectura: z.string().describe('Dónde se va el tiempo y la atención, según lo planificado, lo hecho y lo que se acumula.'),
    fugas: z.array(z.object({ donde: z.string(), por_que: z.string(), impacto: z.enum(['alto', 'medio', 'bajo']) })),
  }),
  consistencia: z.object({ lectura: z.string() }),
  patrones: z.array(z.object({ titulo: z.string(), detalle: z.string() })),
  riesgos: z.array(z.object({ titulo: z.string(), detalle: z.string(), gravedad: z.enum(['alta', 'media', 'baja']) })),
  recomendaciones: z.array(z.object({ accion: z.string(), por_que: z.string(), plazo: z.string() })),
  proxima_semana: z.object({ foco: z.string(), objetivo_medible: z.string() }),
  evolucion: z.string().describe('Qué cambió frente a la ficha anterior; si no la hay, di que esta es la línea de salida.'),
})

const SISTEMA = `Eres el analista de rendimiento personal de Alex dentro de 2day, su app de tareas, hábitos y protocolo diario.
Alex es CEO de una consultoría de sistemas para negocios online y trader sistemático; está en el «Zero Agent Challenge» (90 días) y lleva varios frentes de clientes a la vez. Le gusta ver sus números como la ficha de un personaje de juego.

Te llegan las métricas de 2day de un período (JSON). Escribe su ficha:
- Todo en español, directo, sin humo ni frases motivacionales. Tutéale.
- Cada afirmación se apoya en un dato del JSON; cita números. No inventes nada que no esté.
- Si el período es corto o hay poco dato (por ejemplo, las stats se reiniciaron hace pocos días), dilo, baja la confianza y puntúa con prudencia: una ficha de pocos días es una línea de salida, no un juicio.
- «Consistencia» mide los días seguidos con movimiento en la app (crear, completar o marcar algo).
- «Dónde se va el tiempo»: cruza el tiempo planificado por proyecto, el raíl fijo del protocolo por fase, las tareas vivas acumuladas por proyecto y cuadrante, las atrasadas y la hora del día a la que de verdad se completa. Señala fugas concretas.
- Dimensiones: puntúa las 8 claves (consistencia, ejecucion, foco, planificacion, carga, habitos, cuerpo, frentes) de 0 a 10. «cuerpo» sale de hábitos de cuerpo y medidas de fitness; «frentes» de los hitos y su avance.
- Recomendaciones: pocas (3-5), accionables, con plazo, ordenadas por impacto.
- Si hay ficha anterior, compara y explica la evolución.`

async function usuarioDe(token) {
  if (!SUPABASE_URL || !SUPABASE_ANON || !token) return null
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON, authorization: `Bearer ${token}` } })
  return r.ok ? r.json() : null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Sólo POST' })
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const usuario = await usuarioDe(token)
  if (!usuario?.id) return res.status(401).json({ error: 'Sesión no válida' })
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Falta ANTHROPIC_API_KEY en el servidor' })

  const { metricas, anterior } = req.body || {}
  if (!metricas?.periodo) return res.status(400).json({ error: 'Faltan las métricas' })

  const contenido = [
    `Hoy es ${metricas.periodo.hasta}.`,
    `MÉTRICAS DEL PERÍODO:\n${JSON.stringify(metricas)}`,
    anterior ? `FICHA ANTERIOR (${anterior.fecha}):\n${JSON.stringify(anterior.ficha)}` : 'No hay ficha anterior: esta es la primera.',
  ].join('\n\n')

  const client = new Anthropic()
  try {
    // En streaming y con margen: con 16k y esfuerzo alto, el razonamiento se comía el presupuesto y
    // la ficha (≈ 8k caracteres de JSON) llegaba cortada («Unterminated string», 30-10-2026).
    const stream = client.messages.stream({
      model: MODELO,
      max_tokens: 32000,
      output_config: { effort: 'medium', format: zodOutputFormat(Ficha) },
      system: SISTEMA,
      messages: [{ role: 'user', content: contenido }],
    })
    const r = await stream.finalMessage()
    if (r.stop_reason === 'refusal') return res.status(502).json({ error: 'Claude declinó generar la ficha' })
    if (r.stop_reason === 'max_tokens') return res.status(502).json({ error: 'La ficha llegó cortada (sin espacio); vuelve a intentarlo' })
    const texto = r.content.filter(b => b.type === 'text').map(b => b.text).join('')
    let ficha
    try { ficha = Ficha.parse(JSON.parse(texto)) } catch { return res.status(502).json({ error: 'La ficha llegó con una forma rara; vuelve a intentarlo' }) }
    return res.status(200).json({ modelo: r.model, ficha })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Claude está saturado; prueba en un minuto' })
    if (e instanceof Anthropic.AuthenticationError) return res.status(502).json({ error: 'La clave de Anthropic del servidor no vale' })
    if (e instanceof Anthropic.BadRequestError) return res.status(502).json({ error: `Anthropic rechazó la petición: ${e.error?.error?.message || e.message}` })
    if (e instanceof Anthropic.APIError) return res.status(502).json({ error: `Anthropic ${e.status}: ${e.message}` })
    return res.status(500).json({ error: e?.message || 'Error generando la ficha' })
  }
}
