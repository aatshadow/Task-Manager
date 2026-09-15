/**
 * supabase.js — el único cliente de 2day.
 *
 * La anon key va en el bundle y no es un secreto: es el nombre del proyecto. Lo que
 * protege los datos es la sesión (JWT) más la RLS de cada tabla (`owner_id = auth.uid()`
 * en las `hoy_*`, las políticas del portal en `tasks`).
 *
 * ⚠️ SIN cabecera `x-portal`, a propósito. El portal la manda para decir por qué puerta
 * entra; 2day no la manda y `pc_portal_declarado()` cae en `growthinfo`, que es
 * exactamente lo decidido (LOGICA §0.3): nada de Accelerator Launch ni de Roger.
 */
import { createClient } from '@supabase/supabase-js'

// `import.meta.env` sólo existe bajo Vite. En Node (tests) no hay entorno y el cliente
// lo inyecta el propio test con `usarCliente()`; por eso esto no revienta al importarse.
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {}
const URL = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY

export let isConfigured = Boolean(URL && ANON)

export let supabase = isConfigured
  ? createClient(URL, ANON, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'hoy:auth' },
    })
  : null

/**
 * Sustituye el cliente (tests en Node, que construyen el suyo con login real). Los
 * módulos de `datos/` importan `supabase` como binding vivo de ESM, así que ven el
 * cambio sin reimportar nada. No se usa desde la app.
 */
export function usarCliente(cliente) {
  supabase = cliente
  isConfigured = Boolean(cliente)
}

/* ── ★ AQUÍ NO SE TRAGA NINGÚN ERROR ────────────────────────────────────────
   Regla heredada del portal: un fallo y una lista vacía no pueden verse igual. Todo lo
   que Supabase devuelve con `error` explota con el mensaje de PostgREST y la pantalla
   lo enseña. Un vacío sólo puede significar «no hay nada». */
export class ErrorHoy extends Error {
  constructor(mensaje, causa) {
    super(causa?.message ? `${mensaje}: ${causa.message}` : mensaje)
    this.name = 'ErrorHoy'
    this.causa = causa || null
    this.detalle = causa?.details || causa?.hint || ''
    this.codigo = causa?.code || ''
  }
}

/** Filas de una respuesta, o error. */
export const filas = (r, que = 'no se pudo leer') => {
  if (r?.error) throw new ErrorHoy(que, r.error)
  return Array.isArray(r?.data) ? r.data : []
}

/** Una fila de una respuesta `.single()/.maybeSingle()`, o error. */
export const uno = (r, que = 'no se pudo escribir') => {
  if (r?.error) throw new ErrorHoy(que, r.error)
  return r?.data ?? null
}

/** Sólo comprueba el error de una escritura sin `select`. */
export const ok = (r, que = 'no se pudo escribir') => {
  if (r?.error) throw new ErrorHoy(que, r.error)
  return true
}

/** El id del usuario con sesión, o error si no hay sesión. */
export async function usuarioActual() {
  if (!supabase) throw new ErrorHoy('Supabase no está configurado')
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) throw new ErrorHoy('no hay sesión', error)
  return data.user
}
