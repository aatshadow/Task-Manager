import { Fragment, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Flag, Plus } from 'lucide-react'
import EstadoCarga from './EstadoCarga.jsx'
import HojaHito from './HojaHito.jsx'
import { filasGantt, hitosPorDia, tramoGantt } from './calendario.js'
import { usarArrastreHito } from './arrastreHito.js'
import { useDatos } from '../../estado/useDatos.jsx'
import * as datosHitos from '../../datos/hitos.js'
import { moverHito } from '../../datos/hitos.js'
import { deISO, diaSemanaISO, diasEntre, nombreMes, rangoDias, sumarDias, textoFecha } from '../../datos/fechas.js'

/** `calc(var(--gantt-dia) * n)`: las columnas de día miden lo que diga el CSS (móvil o escritorio). */
const dias = (n) => `calc(var(--gantt-dia) * ${n})`

/**
 * Gantt (LOGICA §5.2): una fila por tarea con fecha, agrupadas por proyecto; la barra va de
 * `inicio` a `vence` (una tarea sin inicio ocupa su día). Arriba, los FRENTES (§5.4): una fila
 * por hito, rombo en su día o barra de `inicio` a `fecha`, que se arrastran (bordes = sólo
 * inicio o sólo final) y se tocan para editarlos; «+» crea uno. Su día sigue marcado con una
 * raya vertical de arriba abajo; la de hoy, naranja. La columna de nombres se queda fija y los
 * días se desplazan en horizontal. Toque en una fila de tarea → su hoja.
 */
export default function VistaGantt({ tareas, hitos, desde, nDias, hoy, fecha, estado = null }) {
  const { nombreProyecto, colorProyecto, abrirTarea, setHitos, recargar, avisar } = useDatos()
  const hasta = sumarDias(desde, nDias - 1)
  const lista = useMemo(() => rangoDias(desde, hasta), [desde, hasta])
  const grupos = useMemo(() => filasGantt(tareas, desde, hasta, nombreProyecto), [tareas, desde, hasta, nombreProyecto])

  /* ── frentes: arrastrar y editar (§5.4) ── */
  const [hoja, setHoja] = useState(null) // null · { hito } · { nuevo: fecha }
  const caja = useRef(null)
  const anchoDia = useCallback(() => caja.current?.querySelector('.gantt-dia')?.offsetWidth || 28, [])
  const soltarHito = useCallback(async (h, modo, delta) => {
    const cambios = moverHito(h, modo, delta, sumarDias)
    setHitos((hs) => hs.map((x) => (x.id === h.id ? { ...x, ...cambios } : x)))
    try {
      await datosHitos.actualizarHito(h.id, cambios)
    } catch (e) {
      avisar(e.message || 'No se pudo mover el frente', 'error')
      recargar()
    }
  }, [setHitos, avisar, recargar])
  const { vuelo, props: arrastrable, suprimirClick } = usarArrastreHito({ alSoltar: soltarHito, anchoDia })
  // Lo que se pinta: el hito en vuelo ya desplazado, para que barra, raya y día se muevan juntos.
  const hitosVivos = useMemo(() => (vuelo
    ? (hitos || []).map((h) => (h.id === vuelo.id ? { ...h, ...moverHito(h, vuelo.modo, vuelo.delta, sumarDias) } : h))
    : hitos || []), [hitos, vuelo])
  const frentes = useMemo(() => hitosVivos
    .filter((h) => h.fecha && (h.inicio || h.fecha) <= hasta && h.fecha >= desde)
    .sort((a, b) => (a.inicio || a.fecha).localeCompare(b.inicio || b.fecha) || a.posicion - b.posicion), [hitosVivos, desde, hasta])
  const hitosDia = useMemo(() => hitosPorDia(hitosVivos, desde, hasta), [hitosVivos, desde, hasta])
  const abrirHito = (h) => { if (!suprimirClick.current) setHoja({ hito: h }) }

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

        {/* ── Frentes (§5.4): una fila por hito, arrastrables; «+» crea uno ── */}
        <div className="gantt-fila gantt-fila--frentes-cabeza">
          <div className="gantt-nombre gantt-nombre--cabecera gantt-nombre--frentes">
            <Flag size={13} strokeWidth={1.75} /> Frentes
            <button type="button" className="gantt-mas" onClick={() => setHoja({ nuevo: fecha >= desde && fecha <= hasta ? fecha : hoy })} aria-label="Nuevo frente" title="Nuevo frente">
              <Plus size={14} strokeWidth={2} />
            </button>
          </div>
          <div className="gantt-pista" />
        </div>
        {frentes.map((h) => {
          const ini = h.inicio && h.inicio < h.fecha ? h.inicio : null
          const a = ini && ini < desde ? desde : ini || h.fecha
          const b = h.fecha > hasta ? hasta : h.fecha
          const col = diasEntre(desde, a)
          const n = diasEntre(a, b) + 1
          const enVuelo = vuelo?.id === h.id
          const titulo = `${h.frente ? `${h.frente}: ` : ''}${h.nombre} · ${ini ? `${textoFecha(ini)} → ` : ''}${textoFecha(h.fecha, true)}`
          return (
            <div key={h.id} className={`gantt-fila gantt-fila--frente${h.hecho ? ' gantt-fila--hecha' : ''}${enVuelo ? ' gantt-fila--vuelo' : ''}`}>
              <button type="button" className="gantt-nombre gantt-frente-nombre" onClick={() => abrirHito(h)} title={titulo}>
                {h.frente && <b>{h.frente}</b>}<span>{h.nombre}</span>
              </button>
              <div className="gantt-pista">
                {ini ? (
                  <span
                    className={['gantt-frente', ini < desde && 'gantt-barra--corta-izq', h.fecha > hasta && 'gantt-barra--corta-der'].filter(Boolean).join(' ')}
                    style={{ left: dias(col), width: dias(n) }}
                    title={titulo}
                    onClick={() => abrirHito(h)}
                    {...arrastrable(h, 'mover')}
                  >
                    {ini >= desde && <span className="gantt-frente-borde gantt-frente-borde--ini" {...arrastrable(h, 'inicio')} />}
                    {n >= 3 && <span className="gantt-frente-texto">{h.nombre}</span>}
                    {h.fecha <= hasta && <span className="gantt-frente-borde gantt-frente-borde--fin" {...arrastrable(h, 'fin')} />}
                  </span>
                ) : (
                  <span
                    className="gantt-frente-rombo"
                    style={{ left: `calc(${dias(col)} + var(--gantt-dia) / 2 - 7px)` }}
                    title={titulo}
                    onClick={() => abrirHito(h)}
                    {...arrastrable(h, 'mover')}
                  />
                )}
                {/* el nombre al lado del rombo (o tras una barra corta): en el móvil la columna sólo cabe el frente */}
                {(!ini || n < 3) && <span className="gantt-frente-lado" style={{ left: `calc(${dias(col + (ini ? n : 1))} + 4px)` }}>{h.nombre}</span>}
                {enVuelo && <span className="gantt-frente-fecha" style={{ left: dias(col) }}>{ini ? `${textoFecha(ini)} → ` : ''}{textoFecha(h.fecha)}</span>}
              </div>
            </div>
          )
        })}

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
      <HojaHito abierta={!!hoja} hito={hoja?.hito || null} fechaInicial={hoja?.nuevo || null} alCerrar={() => setHoja(null)} />
    </div>
  )
}
