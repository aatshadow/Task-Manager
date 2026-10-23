import { useCallback, useEffect, useState } from 'react'
import { Check, X, CheckCheck, Sparkles } from 'lucide-react'
import { useDatos } from '../../estado/useDatos.jsx'
import { aceptarProximo, cambiarDiaProximo, cargarProximos, descartarProximo } from '../../datos/bitacora.js'
import { sumarDias } from '../../datos/fechas.js'

function nombreDia(fecha, hoy) {
  if (!fecha) return 'Sin día'
  if (fecha === hoy) return 'Hoy'
  if (fecha === sumarDias(hoy, 1)) return 'Mañana'
  const [a, m, d] = fecha.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}
const duracion = (min) => (!min ? null : min < 60 ? `${min} min` : `${(min / 60).toFixed(1).replace('.', ',').replace(',0', '')} h`)

/**
 * PRÓXIMOS (LOGICA §14.6): lo que la IA propone hacer después de cada sesión. Alex valida uno
 * a uno: Aceptar crea la tarea para el día elegido (con proyecto, categoría y cuadrante);
 * Descartar la quita. El día se cambia antes de aceptar.
 */
export default function ProximosClaude({ alCambiarCuenta }) {
  const { hoy, recargar, avisar, proyectos, ajustes } = useDatos()
  const [grupos, setGrupos] = useState(null)
  const [ocupado, setOcupado] = useState(null)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    try {
      setError(null)
      const g = await cargarProximos()
      setGrupos(g)
      alCambiarCuenta?.(g.reduce((n, x) => n + x.pasos.length, 0))
    } catch (e) {
      setError(e.message)
    }
  }, [alCambiarCuenta])

  useEffect(() => {
    cargar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargar() }, 15000)
    return () => clearInterval(t)
  }, [cargar])

  const quitarLocal = (id) => setGrupos((gs) => gs.map((g) => ({ ...g, pasos: g.pasos.filter((p) => p.id !== id) })).filter((g) => g.pasos.length))

  const aceptar = async (p) => {
    setOcupado(p.id)
    try {
      await aceptarProximo(p, p.dia < hoy ? hoy : p.dia)
      quitarLocal(p.id)
      recargar()
      avisar(`A tus tareas · ${nombreDia(p.dia < hoy ? hoy : p.dia, hoy)}`, 'ok')
    } catch (e) {
      avisar(e.message, 'error')
    } finally {
      setOcupado(null)
      cargar()
    }
  }
  const aceptarTodos = async (g) => { for (const p of g.pasos) await aceptar(p) }
  const descartar = async (p) => {
    quitarLocal(p.id)
    try { await descartarProximo(p.id) } catch (e) { avisar(e.message, 'error'); cargar() }
  }
  const cambiarDia = async (p, dia) => {
    setGrupos((gs) => gs.map((g) => ({ ...g, pasos: g.pasos.map((x) => (x.id === p.id ? { ...x, dia } : x)) })))
    try { await cambiarDiaProximo(p.id, dia) } catch (e) { avisar(e.message, 'error') }
  }

  if (error) return <div className="claude-error">{error}</div>
  if (!grupos) return <div className="claude-cargando">Cargando…</div>
  if (!grupos.length) {
    return <div className="ctab-vacio"><Sparkles size={22} /> Sin próximos pasos por validar. Aparecen solos al acabar cada turno de Claude.</div>
  }

  const proyecto = (id) => proyectos.find((x) => x.id === id)
  const cuadrante = (q) => ajustes?.cuadrantes?.[q]

  return (
    <div className="cprox">
      {grupos.map((g) => (
        <section key={g.id} className="cprox-grupo">
          <header className="cprox-cabeza">
            <span className="cprox-sesion">{g.reunion ? '🎙 ' : ''}{g.titulo}</span>
            {g.pasos.length > 1 && (
              <button className="ctab-boton" onClick={() => aceptarTodos(g)} disabled={!!ocupado}><CheckCheck size={15} /> Aceptar todos</button>
            )}
          </header>
          {g.pasos.map((p) => {
            const pr = proyecto(p.proyectoId)
            const q = cuadrante(p.cuadrante)
            return (
              <div key={p.id} className="ctab-tarjeta cprox-paso">
                <div className="ctab-titulo">{p.titulo}</div>
                {p.descripcion && <div className="cprox-desc">{p.descripcion}</div>}
                <div className="cprox-chips">
                  {pr && <span style={{ color: pr.color }}>{pr.nombre}</span>}
                  {q && <span style={{ color: q.color }}>{q.nombre}</span>}
                  {duracion(p.minutos) && <span>{duracion(p.minutos)}</span>}
                </div>
                <div className="cprox-pie">
                  <label className="cprox-dia">
                    <span>{nombreDia(p.dia, hoy)}</span>
                    <input type="date" value={p.dia || ''} min={hoy} onChange={(e) => cambiarDia(p, e.target.value)} aria-label="Día" />
                  </label>
                  <button className="ctab-boton" onClick={() => descartar(p)} aria-label="Descartar"><X size={15} /></button>
                  <button className="ctab-boton ctab-boton--ok" onClick={() => aceptar(p)} disabled={ocupado === p.id}><Check size={15} /> Aceptar</button>
                </div>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
