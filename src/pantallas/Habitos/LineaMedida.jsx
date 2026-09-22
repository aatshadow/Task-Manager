import { useMemo } from 'react'

/**
 * La mini-línea de un hábito que se MIDE (peso, horas de sueño): los valores de las
 * últimas 4 semanas en SVG, con el objetivo como línea punteada. Sustituye a la rejilla
 * de marcas: en un `medir` lo que importa es el número, no el sí/no (LOGICA §10.6).
 *
 * Sin datos no se pinta una línea plana en cero (mentiría): se dice que no hay.
 */
const ALTO = 56
const ANCHO = 300
const MARGEN = 6

export default function LineaMedida({ serie, objetivo = null, unidad = '', color = 'var(--acento)' }) {
  const { d, puntos, min, max } = useMemo(() => {
    if (!serie?.length) return { d: '', puntos: [], min: 0, max: 0 }
    const valores = serie.map((p) => p.valor)
    const conObjetivo = objetivo != null ? [...valores, objetivo] : valores
    let mn = Math.min(...conObjetivo)
    let mx = Math.max(...conObjetivo)
    if (mx === mn) { mn -= 1; mx += 1 } // una sola medida: que no salga pegada al borde
    const x = (i) => MARGEN + (serie.length === 1 ? (ANCHO - MARGEN * 2) / 2 : (i / (serie.length - 1)) * (ANCHO - MARGEN * 2))
    const y = (v) => ALTO - MARGEN - ((v - mn) / (mx - mn)) * (ALTO - MARGEN * 2)
    const ps = serie.map((p, i) => ({ ...p, x: x(i), y: y(p.valor) }))
    return { d: ps.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '), puntos: ps, min: mn, max: mx }
  }, [serie, objetivo])

  if (!serie?.length) return <div className="habito-medida-vacia t-terciario">Sin medidas todavía</div>

  const yObjetivo = objetivo != null && max !== min ? ALTO - MARGEN - ((objetivo - min) / (max - min)) * (ALTO - MARGEN * 2) : null

  return (
    <svg className="habito-medida" viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none" role="img" aria-label={`Últimas medidas: ${serie.map((p) => `${p.fecha} ${p.valor}${unidad}`).join(', ')}`}>
      {yObjetivo != null && (
        <line x1={MARGEN} x2={ANCHO - MARGEN} y1={yObjetivo} y2={yObjetivo} stroke="var(--texto-3)" strokeWidth="1" strokeDasharray="4 4" />
      )}
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {puntos.map((p) => (
        <circle key={p.fecha} cx={p.x} cy={p.y} r="2.5" fill={color} />
      ))}
    </svg>
  )
}
