/**
 * Lo que comparten los tests: leer .env sin dependencias, construir el cliente con login
 * real e inyectarlo en la capa de datos. Las credenciales viven en el vault
 * (`~/.core-secrets/hoy-test.env`) y NUNCA se copian al repo.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { usarCliente } from '../src/lib/supabase.js'

export const RAIZ = new URL('..', import.meta.url).pathname

export function leerEnv(ruta) {
  const out = {}
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const l = linea.trim()
    if (!l || l.startsWith('#') || !l.includes('=')) continue
    const i = l.indexOf('=')
    out[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return out
}

export const env = leerEnv(join(RAIZ, '.env'))
export const secretos = leerEnv(join(homedir(), '.core-secrets', 'hoy-test.env'))

/** Cliente anónimo (sin sesión): para comprobar el muro. */
export const clienteAnon = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })

/** Cliente con login real, ya inyectado en `src/lib/supabase.js`. */
export async function entrar() {
  const sb = clienteAnon()
  const { data, error } = await sb.auth.signInWithPassword({ email: secretos.HOY_TEST_EMAIL, password: secretos.HOY_TEST_PASSWORD })
  if (error) throw new Error(`login: ${error.message}`)
  usarCliente(sb)
  return { sb, usuario: data.user }
}

let fallos = 0
export const ok = (msg) => console.log(`  ✓ ${msg}`)
export const ko = (msg, e) => { fallos += 1; console.log(`  ✗ ${msg}${e ? ` — ${e.message || e}` : ''}`) }
export function paso(msg, cond, e) { cond ? ok(msg) : ko(msg, e) }
export function cerrar(nombre) {
  console.log(fallos ? `\n${nombre}: ${fallos} fallo(s)` : `\n${nombre}: todo bien`)
  process.exit(fallos ? 1 : 0)
}
