import { Fragment, useLayoutEffect, useMemo, useRef } from 'react'
import { Flag } from 'lucide-react'
import EstadoCarga from './EstadoCarga.jsx'
import { carrilesHitos, filasGantt, hitosPorDia, tramoGantt } from './calendario.js'
import { useDatos } from '../../estado/useDatos.jsx'
import { deISO, diaSemanaISO, diasEntre, nombreMes, rangoDias, sumarDias, textoFecha } from '../../datos/fechas.js'

/** `calc(var(--gantt-dia) * n)`: las columnas de día miden lo que diga el CSS (móvil o escritorio). */
const dias = (n) => `calc(var(--gantt-dia) * ${n})`

/**
 * Gantt (LOGICA §5.2): una fila por tarea con fecha, agrupadas por proyecto; la barra va de
 * `inicio` a `vence` (una tarea sin inicio ocupa su día). Los hitos son rayas verticales de
 * arriba abajo en su día, con la etiqueta arriba; la de hoy, naranja. La columna de nombres
 * se queda fija y los días se desplazan en horizontal. Toque en una fila → su hoja.
 */
export default function VistaGantt({ tareas, hitos, desde, nDias, hoy, fecha, estado = null }) {
  const { nombreProyecto, colorProyecto, abrirTarea } = useDatos()
  const hasta = sumarDias(desde, nDias - 1)
  const lista = useMemo(() => rangoDias(desde, hasta), [desde, hasta])
  const grupos = useMemo(() => filasGantt(tareas, desde, hasta, nombreProyecto), [tareas, desde, hasta, nombreProyecto])
  const hitosDia = useMemo(() => hitosPorDia(hitos, desde, hasta), [hitos, desde, hasta])
  const etiquetas = useMemo(() => carrilesHitos(hitosDia, desde), [hitosDia, desde])
  const carriles = etiquetas.reduce((n, e) => Math.max(n, e.carril + 1), 0)

  // los meses de la ventana, como tramos de la primera fila de la cabecera
  const meses = useMemo(() => {
    const out = []
    for (const [i, d] of lista.entries()) {
      const clave = d.slice(0, 7)
      if (!out.length || out[out.length - 1].clave !== clave) out.push({ clave, desde: i, n: 0, nombre: nombreMes(d) })
      out[out.length - 1].n++
    }
    return out
  }, [lista])

  // Al abrir, el día elegido (o hoy) queda a tres columnas del borde, no en el lado izquierdo de la ventana.
  const caja = useRef(null)
  useLayoutEffect(() => {
    const el = caja.current
    const celda = el?.querySelector('.gantt-dia')
    if (!el || !celda) return
    const foco = fecha >= desde && fecha <= hasta ? fecha : hoy >= desde && hoy <= hasta ? hoy : desde
    el.scrollLeft = Math.max(0, (diasEntre(desde, foco) - 3) * celda.offsetWidth)
  }, [desde, hasta, fecha, hoy])

  const columnaHoy = hoy >= desde && hoy <= hasta ? diasEntre(desde, hoy) : null
  const vacio = !estado && grupos.length === 0

  return (
    <div className="gantt" ref={caja} style={{ '--gantt-n': nDias }}>
      <div className="gantt-lienzo">
        {/* ── Cabecera: meses, hitos y días ── */}
        <div className="gantt-fila gantt-fila--meses">
          <div className="gantt-nombre gantt-nombre--cabecera" />
          <div className="gantt-pista">
            {meses.map((m) => (
              <span key={m.clave} className="gantt-mes" style={{ left: dias(m.desde), width: dias(m.n) }}>
                {m.nombre.charAt(0).toUpperCase() + m.nombre.slice(1)}
              </span>
            ))}
          </div>
        </div>

        {carriles > 0 && (
          <div className="gantt-fila gantt-fila--hitos" style={{ height: carriles * 22 + 4 }}>
            <div className="gantt-nombre gantt-nombre--cabecera"><Flag size={13} strokeWidth={1.75} /> Hitos</div>
            <div className="gantt-pista">
              {etiquetas.map(({ hito: h, columna, carril }) => (
                <span
                  key={h.id}
                  className={`gantt-hito-etiqueta${h.hecho ? ' gantt-hito-etiqueta--hecho' : ''}`}
                  style={{ left: `calc(${dias(columna)} + var(--gantt-dia) / 2 - 1px)`, top: carril * 22 + 2 }}
                  title={`${textoFecha(h.fecha, true)} · ${h.frente ? `${h.frente}: ` : ''}${h.nombre}`}
                >
                  {h.frente || h.nombre}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="gantt-fila gantt-fila--dias">
          <div className="gantt-nombre gantt-nombre--cabecera" />
          <div className="gantt-pista gantt-pista--dias">
            {lista.map((d) => (
              <span
                key={d}
                className={[
                  'gantt-dia',
                  diaSemanaISO(d) >= 6 && 'gantt-dia--finde',
                  d === hoy && 'gantt-dia--hoy',
                  hitosDia.has(d) && 'gantt-dia--hito',
                ].filter(Boolean).join(' ')}
              >
                {deISO(d).getDate()}
              </span>
            ))}
          </div>
        </div>

        {/* ── Cuerpo: un grupo por proyecto, una fila por tarea ── */}
        <div className="gantt-cuerpo">
          {/* fondo: findes, rayas de hitos y la de hoy, de arriba abajo del cuerpo */}
          <div className="gantt-capa" aria-hidden="true">
            {lista.map((d, i) => (diaSemanaISO(d) >= 6 ? <span key={d} className="gantt-capa-finde" style={{ left: dias(i) }} /> : null))}
            {[...hitosDia].map(([d, hs]) => (
              <span
                key={d}
                className={`gantt-raya gantt-raya--hito${hs.every((h) => h.hecho) ? ' gantt-raya--hecha' : ''}`}
                style={{ left: `calc(${dias(diasEntre(desde, d))} + var(--gantt-dia) / 2 - 1px)` }}
              />
            ))}
            {columnaHoy != null && <span className="gantt-raya gantt-raya--hoy" style={{ left: `calc(${dias(columnaHoy)} + var(--gantt-dia) / 2 - 1px)` }} />}
          </div>

          {estado && <div className="gantt-aviso"><EstadoCarga estado={estado} /></div>}
          {vacio && <div className="gantt-aviso">Ninguna tarea con fecha en estas semanas. Ponles «vence» (y «inicio» si duran) para verlas aquí.</div>}

          {grupos.map((g) => (
            <Fragment key={g.nombre}>
              <div className="gantt-fila gantt-fila--grupo">
                <div className="gantt-nombre">
                  <span className="gantt-grupo-punto" style={{ background: colorProyecto(g.tareas[0]) || 'var(--texto-3)' }} />
                  {g.nombre}
                  <span className="gantt-grupo-cuenta">{g.tareas.length}</span>
                </div>
                <div className="gantt-pista" />
              </div>
              {g.tareas.map((t) => {
                const tr = tramoGantt(t, desde, hasta)
                const color = colorProyecto(t) || 'var(--texto-3)'
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`gantt-fila gantt-fila--tarea${t.hecha ? ' gantt-fila--hecha' : ''}`}
                    onClick={() => abrirTarea(t.id)}
                    title={`${t.titulo} · ${t.inicio && t.inicio < t.vence ? `${textoFecha(t.inicio)} → ` : ''}${textoFecha(t.vence)}`}
                  >
                    <span className="gantt-nombre">{t.titulo}</span>
                    <span className="gantt-pista">
                      <span
                        className={[
                          'gantt-barra',
                          tr.dias === 1 && 'gantt-barra--dia',
                          tr.cortaIzquierda && 'gantt-barra--corta-izq',
                          tr.cortaDerecha && 'gantt-barra--corta-der',
                        ].filter(Boolean).join(' ')}
                        style={{ left: dias(tr.columna), width: dias(tr.dias), '--gantt-color': color }}
                      >
                        {tr.dias >= 4 && <span className="gantt-barra-texto">{t.titulo}</span>}
                      </span>
                    </span>
                  </button>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}
