/**
 * graficos.jsx — los cuatro dibujos de Stats, en SVG propio (sin librerías).
 * Reglas de la casa (skill dataviz): trazos finos, rejilla de un pelo, dos series como
 * mucho (naranja = lo que importa, gris = el contexto), leyenda siempre que hay dos,
 * etiqueta directa solo en el último punto, tooltip al tocar y tabla oculta para el
 * lector de pantalla. Los colores salen de tokens.css y de los datos; aquí no hay hex.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { textoFecha, nombreDia } from '../../datos/fechas.js'
import { ejeLimpio, indicesEtiquetaX, etiquetaDia, trazoMonotono, num } from './calculos.js'

/* ── medidas compartidas ────────────────────────────────────────────────── */

// Un SVG con viewBox fijo deformaría el texto; medimos el ancho real y dibujamos en px.
function useAncho() {
  const ref = useRef(null)
  const [ancho, setAncho] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const medir = () => setAncho(el.getBoundingClientRect().width)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, ancho]
}

/**
 * El punto activo (tooltip): el puntero manda por posición X y las flechas del teclado
 * mueven el índice, para que foco y hover enseñen lo mismo. `aIndice(xPx)` lo da cada gráfico.
 */
function useActivo(n, aIndice) {
  const [activo, setActivo] = useState(null)
  useEffect(() => { if (activo != null && activo >= n) setActivo(null) }, [n, activo])
  const alMover = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const i = aIndice(e.clientX - rect.left)
    setActivo(i == null ? null : Math.max(0, Math.min(n - 1, i)))
  }, [n, aIndice])
  const alTecla = useCallback((e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setActivo((a) => Math.min(n - 1, (a ?? -1) + 1)) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setActivo((a) => Math.max(0, (a ?? n) - 1)) }
    else if (e.key === 'Escape') setActivo(null)
  }, [n])
  const quitar = useCallback(() => setActivo(null), [])
  return {
    activo,
    props: {
      tabIndex: 0,
      onPointerMove: alMover,
      onPointerDown: alMover,
      onPointerLeave: quitar,
      onBlur: quitar,
      onKeyDown: alTecla,
    },
  }
}

/** Caja del tooltip dentro del SVG: se voltea a la izquierda cuando no cabe a la derecha. */
function Tooltip({ x, y, ancho, filas, titulo, anchoCaja = 124 }) {
  const alto = 22 + filas.length * 17
  const derecha = x + 12 + anchoCaja <= ancho
  const cx = derecha ? x + 12 : x - 12 - anchoCaja
  return (
    <g className="st-tooltip" transform={`translate(${cx},${y})`} pointerEvents="none">
      <rect width={anchoCaja} height={alto} rx="10" />
      <text x="10" y="15" className="st-tooltip-titulo">{titulo}</text>
      {filas.map((f, i) => (
        <g key={f.nombre} transform={`translate(10,${31 + i * 17})`}>
          <line x1="0" y1="-3" x2="12" y2="-3" stroke={f.color} strokeWidth="2" strokeLinecap="round" />
          <text x="18" className="st-tooltip-valor">{f.valor}</text>
          <text x={anchoCaja - 20} textAnchor="end" className="st-tooltip-nombre">{f.nombre}</text>
        </g>
      ))}
    </g>
  )
}

/** Leyenda: clave de línea (para líneas) o cuadrado (para barras). */
export function Leyenda({ items, forma = 'linea' }) {
  return (
    <div className="st-leyenda" aria-hidden="true">
      {items.map((it) => (
        <span key={it.nombre} className="st-leyenda-item">
          <span className={`st-clave st-clave--${forma}`} style={{ '--st-color': it.color }} />
          {it.nombre}
        </span>
      ))}
    </div>
  )
}

/** Tabla solo para lectores de pantalla: cada valor del gráfico se puede leer sin tocar. */
function TablaOculta({ titulo, columnas, filas }) {
  return (
    <table className="oculto-visual">
      <caption>{titulo}</caption>
      <thead><tr>{columnas.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
      <tbody>{filas.map((f, i) => <tr key={i}>{f.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
    </table>
  )
}

const COLOR_HECHAS = 'var(--st-hechas)'
const COLOR_CREADAS = 'var(--st-creadas)'

/* ── 1 · creadas vs hechas por día ─────────────────────────────────────── */

const L = { alto: 176, arriba: 16, derecha: 34, abajo: 24, izquierda: 26 }

export function GraficoLineas({ series, n }) {
  const [ref, medido] = useAncho()
  const ancho = medido || 310
  const x0 = L.izquierda
  const x1 = ancho - L.derecha
  const y0 = L.arriba
  const y1 = L.alto - L.abajo
  const total = series.length
  const maximo = Math.max(0, ...series.map((s) => Math.max(s.creadas, s.hechas)))
  const { techo, marcas } = ejeLimpio(maximo, 3)
  const px = (i) => (total <= 1 ? (x0 + x1) / 2 : x0 + (i / (total - 1)) * (x1 - x0))
  const py = (v) => y1 - (v / techo) * (y1 - y0)
  const aIndice = useCallback((x) => {
    if (total <= 1) return 0
    return Math.round(((x - x0) / (x1 - x0)) * (total - 1))
  }, [total, x0, x1])
  const { activo, props } = useActivo(total, aIndice)

  const ptsH = series.map((s, i) => [px(i), py(s.hechas)])
  const ptsC = series.map((s, i) => [px(i), py(s.creadas)])
  const dH = trazoMonotono(ptsH)
  const dC = trazoMonotono(ptsC)
  const dArea = total > 1 ? `${dH} L${px(total - 1)},${y1} L${px(0)},${y1} Z` : ''
  const etiquetas = indicesEtiquetaX(total, n <= 30 ? 5 : 6)
  const ultimo = series[total - 1]
  // Las dos etiquetas finales chocan si los valores son parecidos: se queda la de hechas
  // (la serie que importa); creadas sigue en el tooltip y en la tabla.
  const finalesChocan = ultimo && Math.abs(py(ultimo.hechas) - py(ultimo.creadas)) < 14

  return (
    <div ref={ref} className="st-grafico">
      <svg
        width={ancho}
        height={L.alto}
        className="st-svg"
        role="img"
        aria-label={`Creadas frente a hechas, últimos ${n} días`}
        {...props}
      >
        {marcas.map((m) => (
          <g key={m}>
            <line x1={x0} x2={x1} y1={py(m)} y2={py(m)} className="st-rejilla" />
            <text x={x0 - 6} y={py(m) + 4} textAnchor="end" className="st-eje">{num(m)}</text>
          </g>
        ))}
        {series.map((s, i) => (etiquetas.has(i) ? (
          <text key={s.fecha} x={px(i)} y={L.alto - 6} textAnchor={i === 0 ? 'start' : i === total - 1 ? 'end' : 'middle'} className="st-eje">
            {etiquetaDia(s.fecha, n)}
          </text>
        ) : null))}
        {dArea && <path d={dArea} fill={COLOR_HECHAS} opacity="0.1" />}
        <path d={dC} className="st-linea" stroke={COLOR_CREADAS} />
        <path d={dH} className="st-linea" stroke={COLOR_HECHAS} />
        {ultimo && (
          <g>
            <circle cx={px(total - 1)} cy={py(ultimo.creadas)} r="4" fill={COLOR_CREADAS} className="st-punto" />
            <circle cx={px(total - 1)} cy={py(ultimo.hechas)} r="4" fill={COLOR_HECHAS} className="st-punto" />
            <text x={px(total - 1) + 9} y={py(ultimo.hechas) + 4} className="st-etiqueta-final">{num(ultimo.hechas)}</text>
            {!finalesChocan && (
              <text x={px(total - 1) + 9} y={py(ultimo.creadas) + 4} className="st-etiqueta-final st-etiqueta-final--2">{num(ultimo.creadas)}</text>
            )}
          </g>
        )}
        {activo != null && series[activo] && (
          <g>
            <line x1={px(activo)} x2={px(activo)} y1={y0} y2={y1} className="st-cruz" />
            <circle cx={px(activo)} cy={py(series[activo].creadas)} r="4" fill={COLOR_CREADAS} className="st-punto" />
            <circle cx={px(activo)} cy={py(series[activo].hechas)} r="4" fill={COLOR_HECHAS} className="st-punto" />
            <Tooltip
              x={px(activo)}
              y={y0}
              ancho={ancho}
              titulo={`${nombreDia(series[activo].fecha)} ${textoFecha(series[activo].fecha)}`}
              filas={[
                { nombre: 'hechas', valor: num(series[activo].hechas), color: COLOR_HECHAS },
                { nombre: 'creadas', valor: num(series[activo].creadas), color: COLOR_CREADAS },
              ]}
            />
          </g>
        )}
      </svg>
      <Leyenda items={[{ nombre: 'Hechas', color: COLOR_HECHAS }, { nombre: 'Creadas', color: COLOR_CREADAS }]} />
      <TablaOculta
        titulo="Creadas y hechas por día"
        columnas={['Día', 'Creadas', 'Hechas']}
        filas={series.map((s) => [textoFecha(s.fecha), s.creadas, s.hechas])}
      />
    </div>
  )
}

/* ── 3 · barras horizontales (por proyecto / categoría / cuadrante) ─────── */

// HTML y no SVG a propósito: la etiqueta necesita elipsis y la barra crece en % sin medir.
export function BarrasHorizontales({ filas, colorDe }) {
  const maximo = Math.max(1, ...filas.map((f) => f.n))
  return (
    <ul className="st-barras" role="list">
      {filas.map((f) => (
        <li key={f.clave} className="st-barra-fila">
          <span className="st-barra-nombre" title={f.nombre}>{f.nombre}</span>
          <span className="st-barra-pista">
            <span
              className="st-barra"
              style={{ width: `${(f.n / maximo) * 100}%`, background: f.plegado ? 'var(--st-creadas)' : colorDe(f) || 'var(--st-hechas)' }}
            />
          </span>
          <span className="st-barra-valor">{num(f.n)}</span>
        </li>
      ))}
    </ul>
  )
}

/* ── 4 · sobrecarga día a día (planificadas / hechas) ───────────────────── */

const S = { alto: 150, arriba: 12, derecha: 8, abajo: 24, izquierda: 26 }

export function BarrasDobles({ filas, porSemana = false, n }) {
  const [ref, medido] = useAncho()
  const ancho = medido || 310
  const x0 = S.izquierda
  const x1 = ancho - S.derecha
  const y0 = S.arriba
  const y1 = S.alto - S.abajo
  const total = filas.length
  const maximo = Math.max(0, ...filas.map((f) => Math.max(f.planificadas, f.hechas)))
  const { techo, marcas } = ejeLimpio(maximo, 3)
  const hueco = (x1 - x0) / Math.max(1, total)
  // Con más de dos semanas de huecos (30 días en ~284px) dos barras lado a lado salen de
  // 2px y no se distinguen: ahí las series van SUPERPUESTAS en el mismo hueco, la gris de
  // planificadas detrás a todo el ancho y la naranja de hechas delante, más estrecha, para
  // que la gris asome por los lados aunque se hicieran más de las planificadas.
  const superpuestas = !porSemana && total > 14
  // lado a lado: dos barras por hueco con 2px de superficie entre ellas; nunca más gordas de 24px
  const grosor = Math.min(24, Math.max(2, (hueco - 6) / 2 - 1))
  // superpuestas: 2px de superficie entre huecos vecinos; la de delante al 60 % (mínimo 3px)
  const grosorFondo = Math.min(24, Math.max(3, hueco - 2))
  const grosorFrente = Math.max(3, Math.round(grosorFondo * 0.6))
  const py = (v) => y1 - (v / techo) * (y1 - y0)
  const cx = (i) => x0 + hueco * (i + 0.5)
  const aIndice = useCallback((x) => Math.floor((x - x0) / hueco), [x0, hueco])
  const { activo, props } = useActivo(total, aIndice)
  const etiquetas = indicesEtiquetaX(total, porSemana ? 4 : 5)
  const etiquetaDe = (f) => (porSemana ? (f.enCurso ? 'esta' : textoFecha(f.fecha)) : etiquetaDia(f.fecha, n))
  const tituloDe = (f) => {
    const base = porSemana ? `Semana del ${textoFecha(f.fecha)}` : `${nombreDia(f.fecha)} ${textoFecha(f.fecha)}`
    return f.enCurso ? `${base} · en curso` : base
  }

  return (
    <div ref={ref} className="st-grafico">
      <svg width={ancho} height={S.alto} className="st-svg" role="img" aria-label="Planificadas y hechas por día" {...props}>
        {marcas.map((m) => (
          <g key={m}>
            <line x1={x0} x2={x1} y1={py(m)} y2={py(m)} className="st-rejilla" />
            <text x={x0 - 6} y={py(m) + 4} textAnchor="end" className="st-eje">{num(m)}</text>
          </g>
        ))}
        {filas.map((f, i) => (
          <g key={f.fecha}>
            {activo === i && <rect x={cx(i) - hueco / 2} y={y0} width={hueco} height={y1 - y0} className="st-hueco-activo" />}
            {superpuestas ? (
              <>
                <Columna x={cx(i) - grosorFondo / 2} y={py(f.planificadas)} ancho={grosorFondo} base={y1} color={COLOR_CREADAS} />
                <Columna x={cx(i) - grosorFrente / 2} y={py(f.hechas)} ancho={grosorFrente} base={y1} color={COLOR_HECHAS} />
              </>
            ) : (
              <>
                <Columna x={cx(i) - 1 - grosor} y={py(f.planificadas)} ancho={grosor} base={y1} color={COLOR_CREADAS} />
                <Columna x={cx(i) + 1} y={py(f.hechas)} ancho={grosor} base={y1} color={COLOR_HECHAS} />
              </>
            )}
            {etiquetas.has(i) && (
              <text x={cx(i)} y={S.alto - 6} textAnchor="middle" className="st-eje">{etiquetaDe(f)}</text>
            )}
          </g>
        ))}
        {activo != null && filas[activo] && (
          <Tooltip
            x={cx(activo)}
            y={y0}
            ancho={ancho}
            titulo={tituloDe(filas[activo])}
            anchoCaja={filas[activo].enCurso ? 176 : 140}
            filas={[
              { nombre: 'hechas', valor: num(filas[activo].hechas), color: COLOR_HECHAS },
              { nombre: 'planificadas', valor: num(filas[activo].planificadas), color: COLOR_CREADAS },
            ]}
          />
        )}
      </svg>
      <Leyenda forma="barra" items={[{ nombre: 'Hechas', color: COLOR_HECHAS }, { nombre: 'Planificadas', color: COLOR_CREADAS }]} />
      <TablaOculta
        titulo="Planificadas y hechas por día"
        columnas={[porSemana ? 'Semana' : 'Día', 'Planificadas', 'Hechas']}
        filas={filas.map((f) => [f.enCurso ? `${textoFecha(f.fecha)} (en curso)` : textoFecha(f.fecha), f.planificadas, f.hechas])}
      />
    </div>
  )
}

/** Columna con la punta redondeada (4px) y la base cuadrada, que nace del suelo. */
function Columna({ x, y, ancho, base, color }) {
  const alto = Math.max(0, base - y)
  if (alto <= 0) return null
  const r = Math.min(4, ancho / 2, alto)
  const d = `M${x},${base} V${y + r} a${r},${r} 0 0 1 ${r},-${r} h${ancho - 2 * r} a${r},${r} 0 0 1 ${r},${r} V${base} Z`
  return <path d={d} fill={color} />
}

/* ── 5 · hábitos: cumplimiento por semana ───────────────────────────────── */

const H = { alto: 150, arriba: 14, derecha: 8, abajo: 24, izquierda: 34 }

export function ColumnasSemanas({ semanas }) {
  const [ref, medido] = useAncho()
  const ancho = medido || 310
  const x0 = H.izquierda
  const x1 = ancho - H.derecha
  const y0 = H.arriba
  const y1 = H.alto - H.abajo
  const total = semanas.length
  const hueco = (x1 - x0) / Math.max(1, total)
  const grosor = Math.min(24, hueco - 8)
  const py = (pct) => y1 - ((pct || 0) / 100) * (y1 - y0)
  const cx = (i) => x0 + hueco * (i + 0.5)
  const aIndice = useCallback((x) => Math.floor((x - x0) / hueco), [x0, hueco])
  const { activo, props } = useActivo(total, aIndice)
  const actual = semanas[total - 1]

  return (
    <div ref={ref} className="st-grafico">
      <svg width={ancho} height={H.alto} className="st-svg" role="img" aria-label="Cumplimiento de hábitos por semana" {...props}>
        {[0, 50, 100].map((m) => (
          <g key={m}>
            <line x1={x0} x2={x1} y1={py(m)} y2={py(m)} className="st-rejilla" />
            <text x={x0 - 6} y={py(m) + 4} textAnchor="end" className="st-eje">{m}%</text>
          </g>
        ))}
        {semanas.map((s, i) => (
          <g key={s.fecha}>
            {activo === i && <rect x={cx(i) - hueco / 2} y={y0} width={hueco} height={y1 - y0} className="st-hueco-activo" />}
            {s.pct == null
              ? <line x1={cx(i) - grosor / 2} x2={cx(i) + grosor / 2} y1={y1} y2={y1} className="st-sin-dato" />
              : <Columna x={cx(i) - grosor / 2} y={py(s.pct)} ancho={grosor} base={y1} color={COLOR_HECHAS} />}
            {(i === 0 || i === total - 1 || i === Math.floor((total - 1) / 2)) && (
              <text x={cx(i)} y={H.alto - 6} textAnchor="middle" className="st-eje">{i === total - 1 ? 'esta' : s.etiqueta}</text>
            )}
          </g>
        ))}
        {actual && actual.pct != null && activo == null && (
          <text x={cx(total - 1)} y={py(actual.pct) - 6} textAnchor="middle" className="st-etiqueta-final">{actual.pct}%</text>
        )}
        {activo != null && semanas[activo] && (
          <Tooltip
            x={cx(activo)}
            y={y0}
            ancho={ancho}
            titulo={semanas[activo].actual ? `Esta semana · en curso` : `Semana del ${textoFecha(semanas[activo].fecha)}`}
            anchoCaja={132}
            filas={[{
              nombre: semanas[activo].pct == null ? 'sin hábitos' : `${num(semanas[activo].hechas)} de ${num(semanas[activo].objetivo)}`,
              valor: semanas[activo].pct == null ? '—' : `${semanas[activo].pct}%`,
              color: COLOR_HECHAS,
            }]}
          />
        )}
      </svg>
      <TablaOculta
        titulo="Cumplimiento de hábitos por semana"
        columnas={['Semana', 'Hechas', 'Objetivo', '%']}
        filas={semanas.map((s) => [textoFecha(s.fecha), s.hechas, s.objetivo, s.pct == null ? '—' : `${s.pct}%`])}
      />
    </div>
  )
}
