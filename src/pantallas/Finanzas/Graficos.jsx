import { useRef, useState } from 'react'
import { formatear } from '../../datos/finanzasCalculos.js'

/**
 * Los gráficos del panel de Finanzas, en SVG a mano y en monocromo (LOGICA §18.1): lo que
 * entra en blanco, lo que sale en gris. Cada gráfico tiene su capa de lectura: al pasar el
 * dedo o el ratón sale el detalle; el número nunca va sólo en el color.
 */
const AN = 340
const compacto = (n) => {
  const a = Math.abs(n)
  const t = a >= 1000 ? `${(a / 1000).toLocaleString('es-ES', { maximumFractionDigits: a >= 10000 ? 0 : 1 })}k` : Math.round(a).toLocaleString('es-ES')
  return `${n < 0 ? '−' : ''}${t} €`
}
const fechaLarga = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

// tres o cuatro rayas de referencia «redondas» entre 0 y max
function marcas(max) {
  if (max <= 0) return [0]
  const bruto = max / 3
  const pot = 10 ** Math.floor(Math.log10(bruto))
  const paso = [1, 2, 2.5, 5, 10].map(x => x * pot).find(x => x >= bruto)
  const fuera = []
  for (let v = 0; v <= max + paso * 0.01; v += paso) fuera.push(v)
  if (fuera[fuera.length - 1] < max) fuera.push(fuera[fuera.length - 1] + paso)
  return fuera
}

// barra con los extremos de dato redondeados y la base plana sobre el eje
function barra(x, y, w, h, r = 3) {
  if (h <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`
}

export function Leyenda({ items }) {
  return (
    <div className="fz-g-leyenda">
      {items.map(i => <span key={i.etiqueta}><i className={i.clase} />{i.etiqueta}</span>)}
    </div>
  )
}

/** Entra y sale por semana o por mes: dos barras por tramo, rayas de referencia y el detalle al tocar. */
export function BarrasFlujo({ tramos: meses }) {
  const [activo, setActivo] = useState(null)
  const AL = 190
  const M = { izq: 40, der: 4, arr: 10, aba: 24 }
  const max = Math.max(1, ...meses.flatMap(m => [m.entra, m.sale]))
  const rayas = marcas(max)
  const tope = rayas[rayas.length - 1]
  const y = (v) => M.arr + (AL - M.arr - M.aba) * (1 - v / tope)
  const ancho = (AN - M.izq - M.der) / meses.length
  const w = Math.min(22, (ancho - 8) / 2)
  // con muchos tramos no caben todas las fechas: una de cada `salto`
  const salto = Math.ceil(meses.length / 7)
  const m = activo != null ? meses[activo] : null

  return (
    <div className="fz-g" onPointerLeave={() => setActivo(null)}>
      <svg viewBox={`0 0 ${AN} ${AL}`} role="img" aria-label="Entradas y salidas por mes">
        {rayas.map(v => (
          <g key={v}>
            <line x1={M.izq} x2={AN - M.der} y1={y(v)} y2={y(v)} className={v === 0 ? 'fz-g-base' : 'fz-g-raya'} />
            <text x={M.izq - 6} y={y(v) + 3} textAnchor="end" className="fz-eje">{compacto(v)}</text>
          </g>
        ))}
        {meses.map((mm, i) => {
          const cx = M.izq + ancho * i + ancho / 2
          return (
            <g key={mm.clave} className={activo != null && activo !== i ? 'fz-g-apagado' : ''}>
              <path d={barra(cx - w - 1, y(mm.entra), w, y(0) - y(mm.entra))} className="fz-g-entra" />
              <path d={barra(cx + 1, y(mm.sale), w, y(0) - y(mm.sale))} className="fz-g-sale" />
              {(meses.length - 1 - i) % salto === 0 && <text x={cx} y={AL - 6} textAnchor="middle" className="fz-eje">{mm.etiqueta}</text>}
              <rect x={cx - ancho / 2} y={0} width={ancho} height={AL} fill="transparent"
                onPointerEnter={() => setActivo(i)} onClick={() => setActivo(i)} />
            </g>
          )
        })}
      </svg>
      {m && (
        <div className="fz-g-tip" style={{ left: `${((M.izq + ancho * activo + ancho / 2) / AN) * 100}%` }}>
          <strong>{m.titulo}{m.clave === meses[meses.length - 1].clave ? ' (en curso)' : ''}</strong>
          <span><i className="fz-g-entra" />Entró {formatear(m.entra)}</span>
          <span><i className="fz-g-sale" />Salió {formatear(m.sale)}</span>
          <span>Neto {formatear(m.entra - m.sale, { signo: true })}</span>
        </div>
      )}
    </div>
  )
}

/** El saldo de todas las cuentas día a día, con una cruz que sigue al dedo. */
export function LineaSaldo({ serie }) {
  const [i, setI] = useState(null)
  const svg = useRef(null)
  const AL = 170
  const M = { izq: 40, der: 6, arr: 12, aba: 22 }
  if (serie.length < 2) return <div className="t-terciario">Aún no hay historia suficiente.</div>
  const vals = serie.map(p => p.saldo)
  const rayas = marcas(Math.max(1, ...vals))
  const min = Math.min(0, ...vals)
  const tope = rayas[rayas.length - 1]
  const x = (k) => M.izq + (AN - M.izq - M.der) * k / (serie.length - 1)
  const y = (v) => M.arr + (AL - M.arr - M.aba) * (1 - (v - min) / (tope - min))
  // en escalones: el saldo no se desliza entre días, salta cuando entra o sale algo
  const linea = serie.map((p, k) => (k ? `H${x(k).toFixed(1)} V${y(p.saldo).toFixed(1)}` : `M${x(0).toFixed(1)},${y(p.saldo).toFixed(1)}`)).join(' ')
  const p = i != null ? serie[i] : null

  const mover = (e) => {
    const r = svg.current.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * AN
    setI(Math.max(0, Math.min(serie.length - 1, Math.round((px - M.izq) / (AN - M.izq - M.der) * (serie.length - 1)))))
  }

  return (
    <div className="fz-g" onPointerLeave={() => setI(null)}>
      <svg ref={svg} viewBox={`0 0 ${AN} ${AL}`} role="img" aria-label={`Saldo: de ${formatear(vals[0])} a ${formatear(vals[vals.length - 1])}`} onPointerMove={mover} onPointerDown={mover}>
        <defs>
          <linearGradient id="fz-g-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="rgba(255,255,255,0.22)" />
            <stop offset="1" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        {rayas.map(v => (
          <g key={v}>
            <line x1={M.izq} x2={AN - M.der} y1={y(v)} y2={y(v)} className={v === 0 ? 'fz-g-base' : 'fz-g-raya'} />
            <text x={M.izq - 6} y={y(v) + 3} textAnchor="end" className="fz-eje">{compacto(v)}</text>
          </g>
        ))}
        <path d={`${linea} L${x(serie.length - 1)},${y(min)} L${x(0)},${y(min)} Z`} fill="url(#fz-g-area)" />
        <path d={linea} className="fz-linea fz-linea--igual" />
        {[0, serie.length - 1].map(k => (
          <text key={k} x={x(k)} y={AL - 5} textAnchor={k ? 'end' : 'start'} className="fz-eje">{fechaLarga(serie[k].fecha)}</text>
        ))}
        {p && (
          <g>
            <line x1={x(i)} x2={x(i)} y1={M.arr} y2={AL - M.aba} className="fz-g-cruz" />
            <circle cx={x(i)} cy={y(p.saldo)} r="4.5" className="fz-g-punto" />
          </g>
        )}
      </svg>
      {p && (
        <div className="fz-g-tip" style={{ left: `${(x(i) / AN) * 100}%` }}>
          <strong>{fechaLarga(p.fecha)}</strong>
          <span>Saldo {formatear(p.saldo)}</span>
        </div>
      )}
    </div>
  )
}

/**
 * Un ranking que se abre: cada fila es un grupo (categoría, clase, comercio…) con su barra,
 * su importe y su % del total. Tocarla despliega los movimientos que la forman.
 */
export function Ranking({ grupos, total, alMovimiento, vacio = 'Nada en este periodo.' }) {
  const [abierto, setAbierto] = useState(null)
  if (!grupos.length) return <div className="t-terciario fz-vacio-linea">{vacio}</div>
  const max = grupos[0].total || 1
  return (
    <div className="fz-ranking">
      {grupos.map(g => {
        const esAbierto = abierto === g.clave
        const sin = g.clave === 'Sin clasificar'
        return (
          <div key={g.clave} className={`fz-rank${esAbierto ? ' fz-rank--abierto' : ''}`}>
            <button type="button" className="fz-rank-fila" onClick={() => setAbierto(esAbierto ? null : g.clave)} aria-expanded={esAbierto}>
              <span className="fz-rank-cabeza">
                <span className={`fz-rank-nombre${sin ? ' fz-falta' : ''}`}>{g.clave}</span>
                <span className="fz-rank-cifra">{formatear(g.total)}<span className="t-terciario"> · {total > 0 ? Math.round(g.total / total * 100) : 0} %</span></span>
              </span>
              <span className="fz-rank-pista"><span className={sin ? 'fz-rank-barra fz-rank-barra--sin' : 'fz-rank-barra'} style={{ width: `${Math.max(1.5, g.total / max * 100)}%` }} /></span>
            </button>
            {esAbierto && (
              <div className="fz-rank-detalle">
                {g.movimientos.slice(0, 30).map(m => (
                  <button key={m.id} type="button" className="fz-rank-mov" onClick={() => alMovimiento?.(m)}>
                    <span className="t-terciario">{new Date(`${m.fecha}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
                    <span className="fz-rank-mov-nombre">{m.contraparte || m.descripcion || 'Sin descripción'}</span>
                    <span>{formatear(m.eur, { decimales: 2 })}</span>
                  </button>
                ))}
                {g.movimientos.length > 30 && <div className="t-terciario">y {g.movimientos.length - 30} más en el Libro.</div>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
