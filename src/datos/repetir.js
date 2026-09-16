/**
 * repetir.js — las reglas de repetición (LOGICA §4.1). Puro: sin React, sin Supabase.
 *
 * Vocabulario fijo: `diario` · `laborables` · `semanal` · `mensual` · `cada:N`. Sólo existe la
 * PRÓXIMA ocurrencia: esto calcula qué fecha es, y nada más.
 */
import { aISO, deISO, diaSemanaISO, diasEntre, sumarDias } from './fechas.js'

/** Las opciones del selector, en el orden en que se enseñan. `cada:3` es la propuesta de «cada N». */
export const REGLAS = [
  { clave: 'diario', nombre: 'Cada día' },
  { clave: 'laborables', nombre: 'Entre semana' },
  { clave: 'semanal', nombre: 'Cada semana' },
  { clave: 'mensual', nombre: 'Cada mes' },
  { clave: 'cada:3', nombre: 'Cada N días' },
]

export const esRegla = (r) => /^(diario|laborables|semanal|mensual|cada:[1-9]\d{0,2})$/.test(String(r || ''))

/** `cada:N` → N, o null si no es de ese tipo. */
export const cadaN = (r) => (/^cada:\d+$/.test(String(r || '')) ? Number(String(r).slice(5)) : null)

/** N → `cada:N`, acotado a 1…999. */
export const reglaCadaN = (n) => `cada:${Math.min(999, Math.max(1, Math.round(Number(n) || 1)))}`

/** Cómo se lee una regla: «cada día», «cada 3 días»… (en minúscula, para ir tras «Se repite ·»). */
export function nombreRegla(r) {
  if (!esRegla(r)) return ''
  const n = cadaN(r)
  if (n != null) return n === 1 ? 'cada día' : `cada ${n} días`
  return { diario: 'cada día', laborables: 'entre semana', semanal: 'cada semana', mensual: 'cada mes' }[r]
}

/** Último día del mes de `iso`. */
const diasDelMes = (anio, mes0) => new Date(anio, mes0 + 1, 0).getDate()

/**
 * La primera fecha de la serie ESTRICTAMENTE posterior a `despuesDe`.
 * `ancla` es el `vence` de la tarea (fija el día de la semana / el número del mes / el paso);
 * `despuesDe` es `max(vence, hoy)`: completar tarde no engendra una atrasada, completar pronto
 * no duplica la de mañana.
 */
export function siguienteFecha(regla, ancla, despuesDe = ancla) {
  if (!esRegla(regla) || !ancla) return null
  const tope = despuesDe && despuesDe > ancla ? despuesDe : ancla

  if (regla === 'diario') return sumarDias(tope, 1)

  if (regla === 'laborables') {
    let d = sumarDias(tope, 1)
    while (diaSemanaISO(d) >= 6) d = sumarDias(d, 1)
    return d
  }

  if (regla === 'mensual') {
    const dia = deISO(ancla).getDate()
    const t = deISO(tope)
    // el mismo número en el mes de `tope`; si no pasa de `tope`, el mes siguiente
    for (let salto = 0; salto < 3; salto++) {
      const anio = t.getFullYear()
      const mes0 = t.getMonth() + salto
      const fecha = aISO(new Date(anio, mes0, Math.min(dia, diasDelMes(anio, mes0))))
      if (fecha > tope) return fecha
    }
    return null // no llega: tres meses seguidos sin una fecha posterior es imposible
  }

  // semanal y cada:N son la misma serie con paso distinto: ancla + paso·k, la primera > tope
  const paso = regla === 'semanal' ? 7 : cadaN(regla)
  const k = Math.floor(diasEntre(ancla, tope) / paso) + 1
  return sumarDias(ancla, paso * k)
}
