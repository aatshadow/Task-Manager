import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Undo2, Loader2, Bot } from 'lucide-react'
import { useDatos } from '../../estado/useDatos.jsx'
import { usarGuardar } from '../../estado/usarGuardar.js'
import * as datosTareas from '../../datos/tareas.js'
import { cargarTablero, desfasadas } from '../../datos/bitacora.js'
import { diaDe } from '../../datos/fechas.js'

const REFRESCO_MS = 15000

function hace(ts) {
  const min = Math.max(0, Math.round((Date.now() - new Date(ts)) / 60000))
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`
}

/**
 * El tablero de Claude (LOGICA §14.4): En curso → En revisión → Completado. Claude mueve
 * hasta Revisión; Completar es de Alex. Arriba de En curso, una tarjeta por terminal que
 * está trabajando ahora mismo (la marca el hook UserPromptSubmit).
 */
export default function TableroClaude() {
  const { tareas, hoy, recargar, abrirTarea } = useDatos()
  const guardar = usarGuardar()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    try {
      setError(null)
      setDatos(await cargarTablero())
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    cargar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargar() }, REFRESCO_MS)
    return () => clearInterval(t)
  }, [cargar])

  // Las tareas las crea y las mueve el Mac: si la base dice otra cosa que la memoria (una
  // nueva, o pasó a revisión), se relee. Así el tablero, Sesiones y el resto de 2day van a la par.
  const desfase = datos ? desfasadas(datos.estados, tareas) : false
  useEffect(() => { if (desfase) recargar() }, [desfase, datos, recargar])

  const columnas = useMemo(() => {
    const enCurso = [], revision = [], completado = []
    if (!datos) return { enCurso, revision, completado }
    for (const t of tareas) {
      const c = datos.deClaude.get(t.id)
      if (!c || t.archivadoEn) continue
      const tarjeta = { tarea: t, ...c }
      if (t.hecha) { if (diaDe(t.hechaEn) === hoy) completado.push(tarjeta) } else if (t.estado === 'review') revision.push(tarjeta)
      else enCurso.push(tarjeta)
    }
    const porReciente = (a, b) => ((a.ultimo || '') < (b.ultimo || '') ? 1 : -1)
    enCurso.sort(porReciente); revision.sort(porReciente)
    completado.sort((a, b) => ((a.tarea.hechaEn || '') < (b.tarea.hechaEn || '') ? 1 : -1))
    return { enCurso, revision, completado }
  }, [datos, tareas, hoy])

  const completar = (t) => guardar(t, datosTareas.parcheHecha(true), () => datosTareas.completar(t, true))
  const devolver = (t) => guardar(t, { estado: 'in_progress', hecha: false }, () => datosTareas.aEstado(t, 'in_progress'))

  if (error) return <div className="claude-error">{error}</div>
  if (!datos) return <div className="claude-cargando">Cargando…</div>

  const vacio = !datos.activas.length && !datos.clasificando.length && !columnas.enCurso.length && !columnas.revision.length && !columnas.completado.length

  return (
    <div className="ctab">
      {vacio && (
        <div className="ctab-vacio"><Bot size={22} /> Cuando una terminal de Claude Code empiece a trabajar, aparece aquí.</div>
      )}
      <Columna titulo="En curso" color="var(--aviso)" cuenta={datos.activas.length + columnas.enCurso.length}>
        {datos.activas.map((a) => (
          <div key={a.id} className="ctab-tarjeta ctab-tarjeta--viva">
            <div className="ctab-viva"><span className="ctab-pulso" /> Trabajando ahora · {hace(a.desde)}</div>
            <div className="ctab-titulo">{a.pedido || 'Sin texto'}</div>
            <div className="ctab-meta">{a.titulo || a.carpeta}</div>
          </div>
        ))}
        {datos.clasificando.map((s) => (
          <div key={s.id} className="ctab-tarjeta ctab-tarjeta--clasificando">
            <div className="ctab-viva"><Loader2 size={12} className="boton-girando" /> Clasificando {s.pasos} {s.pasos === 1 ? 'paso' : 'pasos'}</div>
            <div className="ctab-meta">{s.titulo}</div>
          </div>
        ))}
        {columnas.enCurso.map((c) => (
          <Tarjeta key={c.tarea.id} c={c} alAbrir={() => abrirTarea(c.tarea.id)} />
        ))}
      </Columna>

      <Columna titulo="En revisión" color="#4c8dff" className="ctab-columna--revision" cuenta={columnas.revision.length}>
        {columnas.revision.map((c) => (
          <Tarjeta key={c.tarea.id} c={c} alAbrir={() => abrirTarea(c.tarea.id)}>
            <div className="ctab-acciones">
              <button className="ctab-boton ctab-boton--ok" onClick={() => completar(c.tarea)}><Check size={15} /> Completar</button>
              <button className="ctab-boton" onClick={() => devolver(c.tarea)} aria-label="Devolver a En curso"><Undo2 size={15} /> Devolver</button>
            </div>
          </Tarjeta>
        ))}
      </Columna>

      <Columna titulo="Completado hoy" color="var(--ok)" cuenta={columnas.completado.length}>
        {columnas.completado.map((c) => (
          <Tarjeta key={c.tarea.id} c={c} alAbrir={() => abrirTarea(c.tarea.id)} hecha />
        ))}
      </Columna>
    </div>
  )
}

function Columna({ titulo, color, cuenta, className = '', children }) {
  return (
    <section className={`ctab-columna ${className}`}>
      <header className="ctab-columna-cabeza">
        <span className="ctab-punto" style={{ background: color }} />
        {titulo}
        <span className="ctab-cuenta">{cuenta}</span>
      </header>
      <div className="ctab-lista">
        {cuenta ? children : <div className="ctab-nada">Nada</div>}
      </div>
    </section>
  )
}

function Tarjeta({ c, alAbrir, hecha = false, children }) {
  return (
    <div className={`ctab-tarjeta ${hecha ? 'ctab-tarjeta--hecha' : ''}`}>
      <button className="ctab-cuerpo" onClick={alAbrir}>
        <div className="ctab-titulo">{c.tarea.titulo}</div>
        <div className="ctab-meta">
          <span>{c.sesion}</span>
          <span>{c.pasos} {c.pasos === 1 ? 'paso' : 'pasos'} · {hace(hecha ? c.tarea.hechaEn : c.ultimo)}</span>
        </div>
      </button>
      {children}
    </div>
  )
}
