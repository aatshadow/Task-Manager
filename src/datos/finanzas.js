/**
 * finanzas.js — la capa de datos de Finanzas (LOGICA §17). El navegador NUNCA habla con la
 * base del dinero: todo va por `/api/finanzas` con el token de la sesión de 2day.
 */
import { supabase, isConfigured, ErrorHoy } from '../lib/supabase.js'

async function llamar(accion, cuerpo = {}) {
  if (!isConfigured || !supabase) throw new ErrorHoy('Supabase no está configurado')
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new ErrorHoy('Sin sesión: vuelve a entrar')
  let r
  try {
    r = await fetch('/api/finanzas', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ accion, ...cuerpo }),
    })
  } catch {
    throw new ErrorHoy('No se pudo hablar con el servidor de Finanzas')
  }
  const res = await r.json().catch(() => ({}))
  if (!r.ok) throw new ErrorHoy(res.error || `Finanzas falló (${r.status})`)
  return res
}

export const cargar = () => llamar('cargar')
export const guardar = (tabla, fila) => llamar('guardar', { tabla, fila }).then(r => r.fila)
export const borrar = (tabla, id) => llamar('borrar', { tabla, id })
export const sincronizar = () => llamar('sincronizar')
export const pedirParte = () => llamar('parte').then(r => r.parte)
export const preguntar = (pregunta) => llamar('preguntar', { pregunta }).then(r => r.texto)
export const enlaceDocumento = (id) => llamar('enlace', { id }).then(r => r.url)

const MAX_FICHERO = 3 * 1024 * 1024 // Vercel corta el cuerpo en 4,5 MB y el base64 engorda un tercio

export async function subirDocumento(fichero, { movimientoId, previstoId }) {
  if (fichero.size > MAX_FICHERO) throw new ErrorHoy('La factura pesa más de 3 MB')
  const base64 = await new Promise((ok, mal) => {
    const lector = new FileReader()
    lector.onload = () => ok(String(lector.result).split(',')[1] || '')
    lector.onerror = () => mal(new ErrorHoy('No se pudo leer el fichero'))
    lector.readAsDataURL(fichero)
  })
  return llamar('subir', { nombre: fichero.name, tipo: fichero.type, base64, movimientoId, previstoId }).then(r => r.documento)
}

export const clasificar = () => llamar('clasificar')
export const clasificarUno = ({ id, clase, categoria, negocio, siempre }) => llamar('clasificarUno', { id, clase, categoria, negocio, siempre })
