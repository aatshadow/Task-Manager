import { formatear } from '../../datos/finanzasCalculos.js'

// La proyección en tres escenarios (LOGICA §17.1), en SVG a mano: tres líneas y la meta.
const AN = 340
const AL = 170
const M = { izq: 6, der: 6, arr: 14, aba: 22 }
const SERIES = [
  { clave: 'objetivo', etiqueta: 'Lo que pide la Misión', clase: 'fz-linea--objetivo' },
  { clave: 'conservador', etiqueta: 'Conservador (ingresos −30 %)', clase: 'fz-linea--conservador' },
  { clave: 'igual', etiqueta: 'Si todo sigue igual', clase: 'fz-linea--igual' },
]
const mes = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })

export default function Proyeccion({ p }) {
  const pts = p.puntos
  if (pts.length < 2) return <div className="t-terciario">Sin datos para proyectar.</div>
  const valores = pts.flatMap(x => SERIES.map(s => x[s.clave]).filter(v => v != null))
  const min = Math.min(0, ...valores)
  const max = Math.max(1, ...valores)
  const x = (d) => M.izq + (AN - M.izq - M.der) * d / pts[pts.length - 1].d
  const y = (v) => M.arr + (AL - M.arr - M.aba) * (1 - (v - min) / (max - min))
  const camino = (clave) => pts.filter(q => q[clave] != null).map((q, i) => `${i ? 'L' : 'M'}${x(q.d).toFixed(1)},${y(q[clave]).toFixed(1)}`).join(' ')
  const ultimo = pts[pts.length - 1]
  const marcas = [pts[0], pts[Math.floor(pts.length / 2)], ultimo]

  return (
    <div className="fz-proyeccion">
      <svg viewBox={`0 0 ${AN} ${AL}`} role="img" aria-label={`Proyección hasta ${ultimo.fecha}: si todo sigue igual, ${formatear(ultimo.igual)}`}>
        <defs>
          <linearGradient id="fz-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="rgba(255, 255, 255,0.28)" />
            <stop offset="1" stopColor="rgba(255, 255, 255,0)" />
          </linearGradient>
        </defs>
        {min < 0 && <line x1={M.izq} x2={AN - M.der} y1={y(0)} y2={y(0)} className="fz-cero" />}
        <path d={`${camino('igual')} L${x(ultimo.d)},${y(min)} L${x(0)},${y(min)} Z`} fill="url(#fz-area)" />
        {SERIES.map(s => <path key={s.clave} d={camino(s.clave)} className={`fz-linea ${s.clase}`} />)}
        {marcas.map(q => <text key={q.d} x={x(q.d)} y={AL - 6} className="fz-eje" textAnchor={q === pts[0] ? 'start' : q === ultimo ? 'end' : 'middle'}>{mes(q.fecha)}</text>)}
      </svg>
      <div className="fz-leyenda">
        {[...SERIES].reverse().map(s => (
          <div key={s.clave} className="fz-leyenda-fila">
            <i className={s.clase} />
            <span>{s.etiqueta}</span>
            <strong>{ultimo[s.clave] == null ? '—' : formatear(ultimo[s.clave])}</strong>
          </div>
        ))}
        <div className="t-terciario">Ritmo sacado de {p.fuente === 'banco' ? 'tus últimos 30 días de banco' : 'tus previstos recurrentes (aún no hay 14 días de banco)'}.</div>
      </div>
    </div>
  )
}
