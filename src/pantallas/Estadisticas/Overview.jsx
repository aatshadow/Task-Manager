import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Sparkles, TriangleAlert } from 'lucide-react'
import { useDatos } from '../../estado/useDatos.jsx'
import { cargarTodas } from '../../datos/tareas.js'
import { DIMENSIONES, calcularMetricas, cargarVersiones, generarVersion } from '../../datos/overview.js'
import { diaSemanaISO, textoFecha } from '../../datos/fechas.js'
import { Bloque, Radar } from '../Fitness/Ficha.jsx'
import { BarrasHorizontales, GraficoLineas, Leyenda } from './graficos.jsx'
import { plegarOtros } from './calculos.js'
import '../Fitness/ficha.css'
import './overview.css'

const NIVEL = { alto: 'debil', alta: 'debil', medio: null, media: null, bajo: null, baja: null }
const coma = (v) => String(v).replace('.', ',')
const horas = (min) => Math.round((min / 60) * 10) / 10

/**
 * Overview (LOGICA §13): la ficha de TODO 2day. Arriba lo que escribe Claude (titular,
 * arquetipo, nota, radar de 8 dimensiones con la versión anterior de fantasma); alrededor,
 * las métricas deterministas que no necesitan IA (días con movimiento, rachas, mapa de
 * actividad, creadas/hechas, dónde va el tiempo, hábitos). «Regenerar» crea otra versión:
 * nunca se pisa la anterior, y la línea de evolución se dibuja con todas.
 */
export default function Overview() {
  const {
    habitos, marcas, hitos, reto, bloques, fitMedidas, hoy, ajustes, nombreProyecto, colorProyecto, cuadrantes,
    tareas, cargando, avisar,
  } = useDatos()
  const [base, setBase] = useState(null)
  const [versiones, setVersiones] = useState(null)
  const [elegida, setElegida] = useState(0)
  const [generando, setGenerando] = useState(false)
  const [fallo, setFallo] = useState(null)

  // la base con archivadas, como Stats: una tarea archivada tras hacerla también cuenta
  useEffect(() => {
    if (cargando) return undefined
    let vivo = true
    cargarTodas({ incluirArchivadas: true }).then((t) => { if (vivo) setBase(t) }).catch((e) => avisar?.(e.message, 'error'))
    return () => { vivo = false }
  }, [tareas, cargando, avisar])
  useEffect(() => {
    cargarVersiones().then(setVersiones).catch((e) => { setVersiones([]); avisar?.(e.message, 'error') })
  }, [avisar])

  const metricas = useMemo(() => (base ? calcularMetricas({
    tareas: base, habitos, marcas, hitos, reto, bloques, fitMedidas, hoy,
    statsDesde: ajustes?.statsDesde || null, nombreProyecto, cuadrantes,
  }) : null), [base, habitos, marcas, hitos, reto, bloques, fitMedidas, hoy, ajustes, nombreProyecto, cuadrantes])

  const version = versiones?.[elegida] || null
  const previa = versiones?.[elegida + 1] || null
  const ficha = version?.ficha || null

  const generar = async () => {
    if (!metricas || generando) return
    setGenerando(true); setFallo(null)
    try {
      const nueva = await generarVersion(metricas, versiones?.[0] || null)
      setVersiones((vs) => [nueva, ...(vs || [])])
      setElegida(0)
    } catch (e) {
      setFallo(e.message || 'No se pudo generar la ficha')
    } finally {
      setGenerando(false)
    }
  }

  if (!metricas) return <p className="t-secundario ficha-vacia">Leyendo todo 2day…</p>

  const m = metricas
  const atributos = DIMENSIONES.map((d) => ({ ...d, valor: ficha?.dimensiones?.find((x) => x.clave === d.clave)?.nota ?? null }))
  const fantasma = previa ? DIMENSIONES.map((d) => ({ clave: d.clave, valor: previa.ficha?.dimensiones?.find((x) => x.clave === d.clave)?.nota ?? 0 })) : []

  return (
    <div className="ficha overview">
      {/* ── núcleo: lo que dice la IA ── */}
      <section className="ficha-nucleo ov-nucleo">
        <span className="ficha-mira ficha-mira--ai" /><span className="ficha-mira ficha-mira--ad" />
        <span className="ficha-mira ficha-mira--bi" /><span className="ficha-mira ficha-mira--bd" />

        <div className="ov-cabeza">
          <div className="ov-identidad">
            <span className="ov-sello"><Sparkles size={13} strokeWidth={1.75} /> Overview · IA</span>
            {ficha ? (
              <>
                <h2 className="ov-arquetipo">{ficha.perfil?.arquetipo}</h2>
                <p className="ov-titular">{ficha.titular}</p>
              </>
            ) : (
              <>
                <h2 className="ov-arquetipo">Tu ficha</h2>
                <p className="ov-titular">Claude lee todo lo que pasa en 2day y te devuelve la ficha completa: perfil, dónde se va el tiempo, consistencia, riesgos y qué hacer.</p>
              </>
            )}
          </div>
          {ficha && <Anillo valor={ficha.nota_global} />}
        </div>

        {ficha && <p className="ov-resumen">{ficha.resumen}</p>}

        <div className="ov-acciones">
          <button type="button" className="ov-boton" onClick={generar} disabled={generando}>
            {generando ? <span className="ov-girando"><RefreshCw size={15} strokeWidth={2} /></span> : ficha ? <RefreshCw size={15} strokeWidth={2} /> : <Sparkles size={15} strokeWidth={2} />}
            {generando ? 'Claude está leyendo…' : ficha ? 'Regenerar' : 'Generar mi ficha'}
          </button>
          {version && (
            <span className="ov-meta">
              {textoFecha(version.creadaEn.slice(0, 10))} · {m.periodo.dias} días · confianza {ficha.confianza}
            </span>
          )}
        </div>
        {fallo && <p className="ov-fallo"><TriangleAlert size={14} strokeWidth={1.75} /> {fallo}</p>}

        {versiones?.length > 1 && (
          <div className="ov-versiones" role="tablist" aria-label="Versiones de la ficha">
            {versiones.slice(0, 12).map((v, i) => (
              <button key={v.id} role="tab" aria-selected={i === elegida} className={`ov-version${i === elegida ? ' ov-version--activa' : ''}`} onClick={() => setElegida(i)}>
                v{versiones.length - i}
                <small>{textoFecha(v.creadaEn.slice(0, 10))}</small>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── números que no necesitan IA ── */}
      <div className="ov-kpis">
        <Kpi etiqueta="Días con movimiento" valor={`${m.consistencia.diasActivos}/${m.periodo.dias}`} pie={m.consistencia.pctActivos != null ? `${m.consistencia.pctActivos} %` : ''} />
        <Kpi etiqueta="Racha actual" valor={m.consistencia.rachaActual} pie={`mejor ${m.consistencia.mejorRacha}`} acento />
        <Kpi etiqueta="Hechas / creadas" valor={`${m.tareas.hechas}/${m.tareas.creadas}`} pie={m.tareas.cociente != null ? `cociente ${coma(m.tareas.cociente)}` : 'sin creadas'} />
        <Kpi etiqueta="Hábitos" valor={m.habitos.adherenciaMedia != null ? `${m.habitos.adherenciaMedia} %` : '—'} pie={`${m.consistencia.diasPerfectosHabitos} días perfectos`} />
        <Kpi etiqueta="Vivas" valor={m.tareas.vivas} pie={`${m.tareas.sinFecha} sin fecha`} />
        <Kpi etiqueta="Atrasadas" valor={m.tareas.atrasadas} pie={m.tareas.medianaDiasHastaCerrar != null ? `cierras en ${coma(m.tareas.medianaDiasHastaCerrar)} d` : ''} peligro={m.tareas.atrasadas > 0} />
      </div>
      {m.periodo.reiniciadoEl && <p className="ov-nota">Contando desde el {textoFecha(m.periodo.reiniciadoEl, true)} (Ajustes → Día → Stats desde).</p>}

      <Bloque titulo="Consistencia" pie="Un día cuenta si se creó, se completó o se marcó algo en 2day.">
        <MapaActividad serie={m.serie} hoy={hoy} />
        {ficha?.consistencia?.lectura && <p className="ov-lectura">{ficha.consistencia.lectura}</p>}
      </Bloque>

      {ficha && (
        <Bloque titulo="Las 8 dimensiones" pie={previa ? `En acero, la versión del ${textoFecha(previa.creadaEn.slice(0, 10))}.` : 'La primera ficha es la línea de salida.'}>
          <Radar atributos={atributos} fantasma={fantasma} />
          <ul className="ov-dimensiones">
            {DIMENSIONES.map((d) => {
              const x = ficha.dimensiones?.find((y) => y.clave === d.clave)
              const antes = previa?.ficha?.dimensiones?.find((y) => y.clave === d.clave)?.nota
              if (!x) return null
              return (
                <li key={d.clave} className="ov-dim">
                  <div className="ov-dim-linea">
                    <span className="ov-dim-nombre">{d.nombre}</span>
                    <span className="ov-dim-pista"><motion.span className="ov-dim-barra" initial={{ width: 0 }} animate={{ width: `${(x.nota / 10) * 100}%` }} transition={{ duration: 0.6 }} /></span>
                    <span className="ov-dim-cifra">{coma(x.nota)}{antes != null && antes !== x.nota && <small className={x.nota > antes ? 'ov-sube' : 'ov-baja'}>{x.nota > antes ? '▲' : '▼'}{coma(Math.abs(Math.round((x.nota - antes) * 10) / 10))}</small>}</span>
                  </div>
                  <p className="ov-dim-lectura">{x.lectura}</p>
                </li>
              )
            })}
          </ul>
        </Bloque>
      )}

      {versiones?.length > 1 && (
        <Bloque titulo="Evolución" pie="Nota global de cada versión de la ficha.">
          <Evolucion versiones={[...versiones].reverse()} />
          {ficha?.evolucion && <p className="ov-lectura">{ficha.evolucion}</p>}
        </Bloque>
      )}
      {versiones?.length <= 1 && ficha?.evolucion && (
        <Bloque titulo="Evolución"><p className="ov-lectura">{ficha.evolucion}</p></Bloque>
      )}

      <Bloque titulo="Actividad día a día">
        <Leyenda items={[{ nombre: 'Creadas', color: 'var(--st-creadas)' }, { nombre: 'Hechas', color: 'var(--st-hechas)' }]} />
        <GraficoLineas series={m.serie} n={m.serie.length} />
      </Bloque>

      <Bloque titulo="Dónde se va el tiempo">
        {ficha?.tiempo?.lectura && <p className="ov-lectura ov-lectura--arriba">{ficha.tiempo.lectura}</p>}
        {ficha?.tiempo?.fugas?.length > 0 && (
          <ul className="ov-lista">
            {ficha.tiempo.fugas.map((f, i) => (
              <li key={i} className={`ov-item ov-item--${f.impacto}`}>
                <span className="ov-item-titulo">{f.donde}</span>
                <span className="ov-item-chip">{f.impacto}</span>
                <p>{f.por_que}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="ov-rejilla">
          <div>
            <h4 className="ov-sub">Horas planificadas por proyecto</h4>
            {m.tiempo.porProyecto.length
              ? <BarrasHorizontales filas={plegarOtros(m.tiempo.porProyecto.map((f) => ({ clave: f.nombre, nombre: f.nombre, n: horas(f.n) })))} colorDe={() => 'var(--acento)'} />
              : <p className="st-vacio">Nada con hora en este período.</p>}
          </div>
          <div>
            <h4 className="ov-sub">Tareas vivas por proyecto</h4>
            <BarrasHorizontales filas={plegarOtros(m.tareas.vivasPorProyecto.map((f) => ({ clave: f.nombre, nombre: f.nombre, n: f.n })))} colorDe={(f) => colorDeNombre(f.nombre, base, nombreProyecto, colorProyecto)} />
          </div>
          <div>
            <h4 className="ov-sub">Vivas por cuadrante</h4>
            <BarrasHorizontales filas={m.tareas.vivasPorCuadrante.map((f) => ({ clave: f.nombre, nombre: f.nombre, n: f.n }))} colorDe={() => 'var(--st-creadas)'} />
          </div>
          <div>
            <h4 className="ov-sub">A qué hora completas</h4>
            <Columnas valores={m.tareas.hechasPorHora} etiquetas={m.tareas.hechasPorHora.map((_, h) => (h % 6 === 0 ? `${h}h` : ''))} />
            <h4 className="ov-sub">Qué día de la semana</h4>
            <Columnas valores={m.tareas.hechasPorDiaSemana} etiquetas={['L', 'M', 'X', 'J', 'V', 'S', 'D']} marcar={diaSemanaISO(hoy) - 1} />
          </div>
        </div>
      </Bloque>

      {ficha?.perfil && (
        <Bloque titulo="Tu perfil" tono="cabeza">
          <p className="ov-lectura ov-lectura--arriba">{ficha.perfil.descripcion}</p>
          <div className="ov-rejilla">
            <Lista titulo="Fortalezas" items={ficha.perfil.fortalezas} tono="fuerte" />
            <Lista titulo="Puntos ciegos" items={ficha.perfil.puntos_ciegos} tono="debil" />
          </div>
        </Bloque>
      )}

      {ficha?.patrones?.length > 0 && (
        <Bloque titulo="Patrones">
          <ul className="ov-lista">{ficha.patrones.map((p, i) => <li key={i} className="ov-item"><span className="ov-item-titulo">{p.titulo}</span><p>{p.detalle}</p></li>)}</ul>
        </Bloque>
      )}

      {ficha?.riesgos?.length > 0 && (
        <Bloque titulo="Riesgos" tono="debil">
          <ul className="ov-lista">
            {ficha.riesgos.map((r, i) => (
              <li key={i} className={`ov-item ov-item--${r.gravedad}`}>
                <span className="ov-item-titulo">{r.titulo}</span><span className="ov-item-chip">{r.gravedad}</span>
                <p>{r.detalle}</p>
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      {ficha?.recomendaciones?.length > 0 && (
        <Bloque titulo="Qué hacer" tono="fuerte">
          <ol className="ov-lista ov-lista--numerada">
            {ficha.recomendaciones.map((r, i) => (
              <li key={i} className="ov-item">
                <span className="ov-item-titulo">{r.accion}</span><span className="ov-item-chip ov-item-chip--plazo">{r.plazo}</span>
                <p>{r.por_que}</p>
              </li>
            ))}
          </ol>
          {ficha.proxima_semana && (
            <div className="ov-semana">
              <span className="ov-sub">Próxima semana</span>
              <strong>{ficha.proxima_semana.foco}</strong>
              <span>{ficha.proxima_semana.objetivo_medible}</span>
            </div>
          )}
        </Bloque>
      )}

      <Bloque titulo="Hábitos más flojos" pie={m.habitos.porHabito.length > 10 ? `Los 10 peores de ${m.habitos.porHabito.length}.` : undefined}>
        {m.habitos.porHabito.length
          ? <BarrasHorizontales filas={m.habitos.porHabito.slice(0, 10).map((h) => ({ clave: h.nombre, nombre: h.nombre, n: h.pct ?? 0 }))} colorDe={(f) => (f.n >= 80 ? 'var(--ok)' : f.n >= 50 ? 'var(--aviso)' : 'var(--peligro)')} />
          : <p className="st-vacio">Ningún hábito tocaba en este período.</p>}
      </Bloque>

      {m.hitos.length > 0 && (
        <Bloque titulo="Frentes">
          <ul className="ov-hitos">
            {m.hitos.map((h, i) => (
              <li key={i} className={h.hecho ? 'ov-hito--hecho' : h.dias < 0 ? 'ov-hito--pasado' : h.dias <= 3 ? 'ov-hito--cerca' : ''}>
                <span>{textoFecha(h.fecha)}</span><strong>{h.frente || h.nombre}</strong><em>{h.frente ? h.nombre : ''}</em>
                <small>{h.hecho ? 'hecho' : h.dias === 0 ? 'hoy' : h.dias > 0 ? `en ${h.dias} d` : `hace ${-h.dias} d`}</small>
              </li>
            ))}
          </ul>
        </Bloque>
      )}
    </div>
  )
}

/** El color de un proyecto por su nombre: el de la primera tarea suya que haya. */
function colorDeNombre(nombre, tareas, nombreProyecto, colorProyecto) {
  const t = (tareas || []).find((x) => (nombreProyecto(x) || 'Sin proyecto') === nombre)
  return (t && colorProyecto(t)) || 'var(--st-creadas)'
}

export function Kpi({ etiqueta, valor, pie, acento = false, peligro = false }) {
  return (
    <div className={`ov-kpi${acento ? ' ov-kpi--acento' : ''}${peligro ? ' ov-kpi--peligro' : ''}`}>
      <span className="ov-kpi-etiqueta">{etiqueta}</span>
      <span className="ov-kpi-valor">{valor}</span>
      {pie && <span className="ov-kpi-pie">{pie}</span>}
    </div>
  )
}

/** La nota global 0-100 como anillo. */
export function Anillo({ valor }) {
  const R = 38, C = 2 * Math.PI * R
  const v = Math.max(0, Math.min(100, Number(valor) || 0))
  return (
    <div className="ov-anillo" aria-label={`Nota global ${v} de 100`}>
      <svg viewBox="0 0 92 92" aria-hidden>
        <circle cx="46" cy="46" r={R} className="ov-anillo-pista" />
        <motion.circle
          cx="46" cy="46" r={R} className="ov-anillo-lleno"
          strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - v / 100) }}
          transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
          transform="rotate(-90 46 46)"
        />
      </svg>
      <span className="ov-anillo-cifra">{Math.round(v)}</span>
      <span className="ov-anillo-nombre">global</span>
    </div>
  )
}

/** Mapa de actividad: una celda por día, de lunes a domingo en columnas por semana. */
function MapaActividad({ serie, hoy }) {
  const [activa, setActiva] = useState(null)
  if (!serie.length) return null
  const nivel = (d) => {
    const n = d.creadas + d.hechas + d.marcas
    return n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : 4
  }
  const hueco = diaSemanaISO(serie[0].fecha) - 1
  const celdas = [...Array(hueco).fill(null), ...serie]
  const sel = activa != null ? serie[activa] : null
  return (
    <div className="ov-mapa">
      <div className="ov-mapa-rejilla" style={{ gridTemplateRows: 'repeat(7, var(--ov-celda))' }}>
        {celdas.map((d, i) => (d
          ? <button
              key={d.fecha}
              type="button"
              className={`ov-mapa-celda ov-n${nivel(d)}${d.fecha === hoy ? ' ov-mapa-celda--hoy' : ''}`}
              onPointerEnter={() => setActiva(i - hueco)}
              onClick={() => setActiva(i - hueco)}
              aria-label={`${textoFecha(d.fecha, true)}: ${d.creadas} creadas, ${d.hechas} hechas, ${d.marcas} marcas`}
            />
          : <span key={`h${i}`} />))}
      </div>
      <p className="ov-mapa-pie">
        {sel ? `${textoFecha(sel.fecha, true)} · ${sel.creadas} creadas · ${sel.hechas} hechas · ${sel.marcas} marcas${sel.adherencia != null ? ` · hábitos ${sel.adherencia} %` : ''}` : 'Toca un día para ver qué se movió.'}
      </p>
    </div>
  )
}

/** Columnas pequeñas (hora del día, día de la semana). HTML: crecen en % sin medir. */
function Columnas({ valores, etiquetas, marcar = null }) {
  const max = Math.max(1, ...valores)
  return (
    <div className="ov-columnas" style={{ gridTemplateColumns: `repeat(${valores.length}, 1fr)` }}>
      {valores.map((v, i) => (
        <div key={i} className="ov-columna" title={`${v}`}>
          <span className={`ov-columna-barra${i === marcar ? ' ov-columna-barra--marca' : ''}`} style={{ height: `${(v / max) * 100}%` }} />
          <span className="ov-columna-etiqueta">{etiquetas[i]}</span>
        </div>
      ))}
    </div>
  )
}

/** La nota global de cada versión, en línea. */
export function Evolucion({ versiones }) {
  const W = 320, H = 120, P = 18
  const xs = versiones.map((_, i) => (versiones.length === 1 ? W / 2 : P + (i / (versiones.length - 1)) * (W - 2 * P)))
  const ys = versiones.map((v) => H - P - ((Number(v.ficha?.nota_global) || 0) / 100) * (H - 2 * P))
  const linea = xs.map((x, i) => `${i ? 'L' : 'M'}${x},${ys[i]}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ov-evolucion" role="img" aria-label={versiones.map((v) => `${textoFecha(v.creadaEn.slice(0, 10))}: ${v.ficha?.nota_global}`).join(', ')}>
      {[25, 50, 75].map((k) => <line key={k} x1={P} x2={W - P} y1={H - P - (k / 100) * (H - 2 * P)} y2={H - P - (k / 100) * (H - 2 * P)} className="ov-evolucion-guia" />)}
      <path d={linea} className="ov-evolucion-linea" />
      {xs.map((x, i) => (
        <g key={i}>
          <circle cx={x} cy={ys[i]} r="3.5" className="ov-evolucion-punto" />
          <text x={x} y={ys[i] - 8} textAnchor="middle" className="ov-evolucion-cifra">{Math.round(versiones[i].ficha?.nota_global || 0)}</text>
        </g>
      ))}
    </svg>
  )
}

export function Lista({ titulo, items, tono }) {
  if (!items?.length) return null
  return (
    <div className={`ov-puntos ov-puntos--${tono}`}>
      <h4 className="ov-sub">{titulo}</h4>
      <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  )
}
