import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, X, Undo2, Loader2, Mic, Sparkles, Terminal } from 'lucide-react'
import './panel.css'
import { useDatos } from '../../estado/useDatos.jsx'
import { usarGuardar } from '../../estado/usarGuardar.js'
import * as datosTareas from '../../datos/tareas.js'
import { aceptarProximo, cargarProximos, cargarReuniones, cargarTablero, desfasadas, descartarProximo } from '../../datos/bitacora.js'
import { diaDe, sumarDias } from '../../datos/fechas.js'
import { resumenHoy } from '../../datos/estadisticas.js'

const REFRESCO_MS = 10000

function hace(ts) {
  const min = Math.max(0, Math.round((Date.now() - new Date(ts)) / 60000))
  if (min < 1) return 'ahora'
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}
const nombreDia = (f, hoy) => (f === hoy ? 'hoy' : f === sumarDias(hoy, 1) ? 'mañana' : f ? f.slice(8, 10) + '/' + f.slice(5, 7) : '')

/**
 * PANEL (LOGICA §14.8): la ventana pequeña que abre el widget de la barra de menús. Todo lo
 * vivo de un vistazo: terminales trabajando, lo que espera revisión, próximos por validar,
 * reuniones de hoy y el anillo del día. Se refresca cada 10 s.
 */
export default function Panel() {
  const { tareas, hoy, recargar, avisar, proyectos, clientes, nombreProyecto } = useDatos()
  const guardar = usarGuardar()
  const [tablero, setTablero] = useState(null)
  const [proximos, setProximos] = useState([])
  const [reuniones, setReuniones] = useState([])
  const [, setTic] = useState(0)

  const cargar = useCallback(async () => {
    try {
      const [t, p, r] = await Promise.all([cargarTablero(), cargarProximos(), cargarReuniones(1)])
      setTablero(t); setProximos(p.flatMap((g) => g.pasos.map((x) => ({ ...x, de: g.titulo, reunion: g.reunion })))); setReuniones(r)
    } catch (e) { avisar(e.message, 'error') }
  }, [avisar])
  useEffect(() => {
    cargar()
    const a = setInterval(() => { if (document.visibilityState === 'visible') cargar() }, REFRESCO_MS)
    const b = setInterval(() => setTic((n) => n + 1), 30000) // los «hace N min» avanzan solos
    return () => { clearInterval(a); clearInterval(b) }
  }, [cargar])
  const desfase = tablero ? desfasadas(tablero.estados, tareas) : false
  useEffect(() => { if (desfase) recargar() }, [desfase, tablero, recargar])

  const revision = useMemo(() => tareas.filter((t) => !t.hecha && !t.archivadoEn && t.estado === 'review'), [tareas])
  const enCurso = useMemo(() => (tablero ? tareas.filter((t) => !t.hecha && !t.archivadoEn && t.estado !== 'review' && tablero.deClaude.has(t.id)) : []), [tareas, tablero])
  const r = resumenHoy(tareas, hoy)
  const hechasHoy = tareas.filter((t) => t.hecha && diaDe(t.hechaEn) === hoy).length
  const total = hechasHoy + r.enHoy
  const pct = total ? hechasHoy / total : 0

  const completar = (t) => guardar(t, datosTareas.parcheHecha(true), () => datosTareas.completar(t, true))
  const devolver = (t) => guardar(t, { estado: 'in_progress' }, () => datosTareas.aEstado(t, 'in_progress'))
  const aceptar = async (p) => {
    setProximos((xs) => xs.filter((x) => x.id !== p.id))
    try { await aceptarProximo(p, p.dia < hoy ? hoy : p.dia); recargar() } catch (e) { avisar(e.message, 'error'); cargar() }
  }
  const descartar = async (p) => {
    setProximos((xs) => xs.filter((x) => x.id !== p.id))
    try { await descartarProximo(p.id) } catch (e) { avisar(e.message, 'error'); cargar() }
  }
  const proyectoDe = (x) => (x.clientId ? clientes.find((c) => c.id === x.clientId)?.nombre : proyectos.find((p) => p.id === x.proyectoId)?.nombre)

  const activas = tablero?.activas || []
  const R = 30, C = 2 * Math.PI * R

  return (
    <div className="panel">
      <header className="panel-cabeza">
        <div>
          <div className="panel-marca">2day</div>
          <div className="panel-fecha">{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        <div className="panel-anillo" title={`${hechasHoy} hechas de ${total}`}>
          <svg width="76" height="76" viewBox="0 0 76 76">
            <circle cx="38" cy="38" r={R} className="panel-anillo-fondo" />
            {pct > 0 && <circle cx="38" cy="38" r={R} className="panel-anillo-valor" strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 38 38)" />}
          </svg>
          <div className="panel-anillo-texto"><b>{hechasHoy}</b><span>/{total}</span></div>
        </div>
      </header>

      <div className="panel-cifras">
        <Cifra n={activas.length} etiqueta="trabajando" color="var(--aviso)" />
        <Cifra n={revision.length} etiqueta="revisión" color="#4c8dff" />
        <Cifra n={proximos.length} etiqueta="próximos" color="var(--acento)" />
      </div>

      <Bloque titulo="Trabajando ahora" icono={<Terminal size={14} />}>
        {!activas.length && <div className="panel-nada">Ninguna terminal trabajando</div>}
        {activas.map((a) => (
          <div key={a.id} className="panel-viva">
            <span className="panel-pulso" />
            <div className="panel-viva-texto">
              <div className="panel-linea">{a.pedido || '…'}</div>
              <div className="panel-sub">{a.titulo} · {hace(a.desde)}</div>
            </div>
          </div>
        ))}
        {tablero?.clasificando.map((s) => (
          <div key={s.id} className="panel-sub panel-clasif"><Loader2 size={12} className="boton-girando" /> Clasificando {s.pasos} · {s.titulo}</div>
        ))}
      </Bloque>

      <Bloque titulo={`En revisión · ${revision.length}`} color="#4c8dff">
        {!revision.length && <div className="panel-nada">Nada esperando tu visto bueno</div>}
        {revision.slice(0, 8).map((t) => (
          <div key={t.id} className="panel-fila">
            <div className="panel-fila-texto">
              <div className="panel-linea">{t.titulo}</div>
              <div className="panel-sub">{nombreProyecto(t) || 'Sin proyecto'}</div>
            </div>
            <button className="panel-boton panel-boton--ok" onClick={() => completar(t)} title="Completar"><Check size={15} /></button>
            <button className="panel-boton" onClick={() => devolver(t)} title="Devolver a En curso"><Undo2 size={14} /></button>
          </div>
        ))}
      </Bloque>

      <Bloque titulo={`Próximos · ${proximos.length}`} icono={<Sparkles size={14} />} color="var(--acento)">
        {!proximos.length && <div className="panel-nada">Sin próximos por validar</div>}
        {proximos.slice(0, 8).map((p) => (
          <div key={p.id} className="panel-fila">
            <div className="panel-fila-texto">
              <div className="panel-linea">{p.titulo}</div>
              <div className="panel-sub">{p.reunion ? '🎙 ' : ''}{proyectoDe(p) || p.de} · <span className="panel-dia">{nombreDia(p.dia, hoy)}</span></div>
            </div>
            <button className="panel-boton panel-boton--ok" onClick={() => aceptar(p)} title="Aceptar"><Check size={15} /></button>
            <button className="panel-boton" onClick={() => descartar(p)} title="Descartar"><X size={14} /></button>
          </div>
        ))}
        {proximos.length > 8 && <div className="panel-sub">y {proximos.length - 8} más en Tareas → Claude → Próximos</div>}
      </Bloque>

      {enCurso.length > 0 && (
        <Bloque titulo={`En curso · ${enCurso.length}`} color="var(--aviso)">
          {enCurso.slice(0, 6).map((t) => (
            <div key={t.id} className="panel-fila">
              <div className="panel-fila-texto">
                <div className="panel-linea">{t.titulo}</div>
                <div className="panel-sub">{nombreProyecto(t) || 'Sin proyecto'}</div>
              </div>
            </div>
          ))}
        </Bloque>
      )}

      {reuniones.length > 0 && (
        <Bloque titulo="Reuniones · 24 h" icono={<Mic size={14} />}>
          {reuniones.map((m) => (
            <div key={m.id} className="panel-fila">
              <div className="panel-fila-texto">
                <div className="panel-linea">{m.titulo}</div>
                <div className="panel-sub">{new Date(m.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · {m.minutos} min{m.propuestas ? ` · ${m.propuestas} por validar` : ''}</div>
              </div>
            </div>
          ))}
        </Bloque>
      )}
    </div>
  )
}

function Cifra({ n, etiqueta, color }) {
  return (
    <div className="panel-cifra">
      <b style={{ color: n ? color : 'var(--texto-3)' }}>{n}</b>
      <span>{etiqueta}</span>
    </div>
  )
}

function Bloque({ titulo, icono, color, children }) {
  return (
    <section className="panel-bloque">
      <div className="panel-bloque-titulo">
        {color ? <span className="panel-punto" style={{ background: color }} /> : icono}
        {titulo}
      </div>
      <div className="panel-bloque-cuerpo">{children}</div>
    </section>
  )
}
