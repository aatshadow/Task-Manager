import { useCallback, useEffect, useState } from 'react'
import { Mic, ChevronDown } from 'lucide-react'
import { useDatos } from '../../estado/useDatos.jsx'
import { cargarReuniones } from '../../datos/bitacora.js'

const cuando = (ts) => new Date(ts).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * REUNIONES (LOGICA §14.7): lo que grabó Wispr Flow, ya resumido. Las tareas de cada una están
 * en Próximos (para validar); aquí se ve cuántas dejó y cuántas aceptaste.
 */
export default function ReunionesClaude({ alIrAProximos }) {
  const { proyectos } = useDatos()
  const [lista, setLista] = useState(null)
  const [error, setError] = useState(null)
  const [abierta, setAbierta] = useState(null)

  const cargar = useCallback(async () => {
    try { setError(null); setLista(await cargarReuniones()) } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => {
    cargar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargar() }, 30000)
    return () => clearInterval(t)
  }, [cargar])

  if (error) return <div className="claude-error">{error}</div>
  if (!lista) return <div className="claude-cargando">Cargando…</div>
  if (!lista.length) return <div className="ctab-vacio"><Mic size={22} /> Cuando grabes una reunión con Wispr Flow, aparece aquí con su resumen y sus tareas.</div>

  return (
    <div className="creu">
      {lista.map((r) => {
        const pr = proyectos.find((p) => p.id === r.proyectoId)
        const abiertaEsta = abierta === r.id
        return (
          <section key={r.id} className="claude-sesion">
            <header>
              <div className="claude-sesion-titulo">{r.titulo}</div>
              <div className="claude-sesion-meta">
                <span>{cuando(r.inicio)}</span>
                <span>{r.minutos} min</span>
                {pr && <span className="cproy"><i style={{ background: pr.color }} />{pr.nombre}</span>}
              </div>
            </header>
            <div className={`creu-resumen ${abiertaEsta ? '' : 'creu-resumen--corto'}`}>
              {r.resumen.split('\n').filter((l) => l.trim()).map((l, i) => <p key={i}>{l.replace(/^\s*[-•]\s*/, '')}</p>)}
            </div>
            {abiertaEsta && r.decisiones.length > 0 && (
              <div className="creu-decisiones">
                <div className="creu-etiqueta">Decisiones</div>
                {r.decisiones.map((d, i) => <p key={i}>{d}</p>)}
              </div>
            )}
            <div className="claude-pie">
              {r.propuestas > 0
                ? <button className="ctab-boton ctab-boton--ok" onClick={alIrAProximos}>{r.propuestas} {r.propuestas === 1 ? 'tarea' : 'tareas'} por validar</button>
                : <span className="claude-cola" style={{ color: 'var(--texto-3)' }}>{r.aceptadas ? `${r.aceptadas} aceptadas` : 'Sin tareas pendientes'}</span>}
              <button className="claude-ver" onClick={() => setAbierta(abiertaEsta ? null : r.id)} aria-expanded={abiertaEsta}>
                {abiertaEsta ? 'Menos' : 'Todo y decisiones'} <ChevronDown size={16} className={abiertaEsta ? 'claude-girado' : ''} />
              </button>
            </div>
          </section>
        )
      })}
    </div>
  )
}
