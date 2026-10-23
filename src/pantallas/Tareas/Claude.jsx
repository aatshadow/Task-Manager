import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Bot, CheckCircle2, CircleDashed, RefreshCw, ChevronDown, FileText, Terminal } from 'lucide-react'
import Boton from '../../componentes/Boton.jsx'
import Segmentos from '../../componentes/Segmentos.jsx'
import TableroClaude from './TableroClaude.jsx'
import ProximosClaude from './ProximosClaude.jsx'
import { cargarProximos } from '../../datos/bitacora.js'
import Vacio from '../../componentes/Vacio.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import { usarGuardar } from '../../estado/usarGuardar.js'
import * as datosTareas from '../../datos/tareas.js'
import { cargarDia, desfasadas, pedirProceso, resumenDia } from '../../datos/bitacora.js'
import { sumarDias } from '../../datos/fechas.js'

const hora = (ts) => new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
const horas = (min) => (min < 60 ? `${min}m` : `${(min / 60).toFixed(1).replace('.', ',')}h`)

function nombreDia(fecha, hoy) {
  if (fecha === hoy) return 'Hoy'
  if (fecha === sumarDias(hoy, -1)) return 'Ayer'
  const [a, m, d] = fecha.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
}

// La pestaña recuerda la cara y el día al volver de una tarea abierta.
let ultimoDia = null
let ultimaCara = 'tablero'
/** CLAUDE (LOGICA §14): tres caras, el tablero (§14.4), los próximos pasos por validar (§14.6) y las sesiones del día. */
export default function Claude() {
  const [cara, setCaraEstado] = useState(ultimaCara)
  const setCara = (c) => { ultimaCara = c; setCaraEstado(c) }
  // La cuenta de próximos va en la etiqueta: se ve desde cualquier cara que hay algo por validar.
  const [porValidar, setPorValidar] = useState(0)
  useEffect(() => {
    let vivo = true
    const contar = () => cargarProximos().then((g) => { if (vivo) setPorValidar(g.reduce((n, x) => n + x.pasos.length, 0)) }).catch(() => {})
    contar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') contar() }, 15000)
    return () => { vivo = false; clearInterval(t) }
  }, [])
  const caras = [
    { valor: 'tablero', etiqueta: 'Tablero' },
    { valor: 'proximos', etiqueta: porValidar ? `Próximos · ${porValidar}` : 'Próximos' },
    { valor: 'sesiones', etiqueta: 'Sesiones' },
  ]
  return (
    <div className="claude">
      <Segmentos opciones={caras} valor={cara} alCambiar={setCara} className="claude-caras" />
      {cara === 'tablero' && <TableroClaude />}
      {cara === 'proximos' && <ProximosClaude alCambiarCuenta={setPorValidar} />}
      {cara === 'sesiones' && <Sesiones />}
    </div>
  )
}

/**
 * Sesiones: lo que hicieron las sesiones de Claude Code en un día. Cada sesión con su
 * resumen, las tareas que la IA sacó de sus pasos y, desplegando, los pasos en crudo.
 */
function Sesiones() {
  const { hoy, ajustes, tareas, abrirTarea, recargar, avisar } = useDatos()
  const [dia, setDiaEstado] = useState(ultimoDia || hoy)
  const setDia = (d) => { ultimoDia = d; setDiaEstado(d) }
  const [sesiones, setSesiones] = useState(null)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    try {
      setError(null)
      setSesiones(await cargarDia(dia, ajustes?.horaReinicio))
    } catch (e) {
      setError(e.message)
    }
  }, [dia, ajustes?.horaReinicio])

  useEffect(() => { setSesiones(null); cargar() }, [cargar])
  const desfase = sesiones?.estados ? desfasadas(sesiones.estados, tareas) : false
  useEffect(() => { if (desfase) recargar() }, [desfase, sesiones, recargar])

  // Al mismo ritmo que el tablero (§14.4): las dos caras dicen lo mismo a la vez.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargar() }, 15000)
    return () => clearInterval(t)
  }, [cargar])

  const procesar = async (s) => {
    try {
      await pedirProceso(s.id)
      avisar('En cola: se procesa en unos minutos', 'ok')
      cargar()
    } catch (e) {
      avisar(e.message, 'error')
    }
  }

  // Las tareas las crea el Mac: si aún no están en memoria, se relee antes de abrir la hoja.
  const abrir = async (id) => {
    if (!tareas.some((t) => t.id === id)) await recargar()
    abrirTarea(id)
  }

  const r = sesiones ? resumenDia(sesiones) : null

  return (
    <div className="claude-sesiones">
      <div className="claude-dia">
        <button className="claude-flecha" onClick={() => setDia(sumarDias(dia, -1))} aria-label="Día anterior"><ChevronLeft size={20} /></button>
        <div className="claude-dia-nombre">{nombreDia(dia, hoy)}</div>
        <button className="claude-flecha" onClick={() => setDia(sumarDias(dia, 1))} disabled={dia >= hoy} aria-label="Día siguiente"><ChevronRight size={20} /></button>
      </div>

      {r && (
        <div className="claude-numeros">
          <div><b>{r.sesiones}</b><span>sesiones</span></div>
          <div><b>{r.pasos}</b><span>pasos</span></div>
          <div><b className="claude-ok">{r.hechas}</b><span>tareas hechas</span></div>
          <div><b>{horas(r.minutos)}</b><span>de Claude</span></div>
        </div>
      )}

      {error && <div className="claude-error">{error}</div>}
      {!sesiones && !error && <div className="claude-cargando">Cargando…</div>}
      {sesiones && !sesiones.length && (
        <Vacio icono={Bot} titulo="Sin sesiones de Claude" texto="Cada sesión de Claude Code que abras se apunta aquí sola, paso a paso, y la IA la convierte en tareas." />
      )}
      {sesiones?.map((s) => <Sesion key={s.id} sesion={s} tareas={tareas} alAbrir={abrir} alProcesar={() => procesar(s)} />)}
    </div>
  )
}

// Las mismas tres columnas que el tablero, con el mismo nombre y color.
const COLUMNA = {
  in_progress: { nombre: 'En curso', clase: 'claude-curso' },
  review: { nombre: 'En revisión', clase: 'claude-revision' },
  done: { nombre: 'Completada', clase: 'claude-ok' },
}
const columnaDe = (t) => (t.hecha ? 'done' : t.estado === 'review' ? 'review' : 'in_progress')

function Sesion({ sesion: s, tareas: enMemoria, alAbrir, alProcesar }) {
  const [abierta, setAbierta] = useState(false)
  const guardar = usarGuardar()
  // El estado de cada tarea sale de la MISMA lista que pinta el tablero (el contexto): completar
  // o devolver en una cara se ve al instante en la otra. Lo leído de la base sólo si aún no está.
  const tareasSesion = s.tareas.map((t) => ({ ...t, ...(enMemoria.find((m) => m.id === t.id) || {}), pasos: t.pasos }))
  const hechas = tareasSesion.filter((t) => t.hecha).length
  const completar = (t) => guardar(t, datosTareas.parcheHecha(true), () => datosTareas.completar(t, true))
  return (
    <section className="claude-sesion">
      <header className="claude-sesion-cabeza">
        <div className="claude-sesion-titulo">{s.titulo}</div>
        <div className="claude-sesion-meta">
          <span>{s.carpeta}</span>
          <span>{hora(s.inicio)}–{hora(s.fin)}</span>
          <span>{s.pasos.length} {s.pasos.length === 1 ? 'paso' : 'pasos'}</span>
          {s.tareas.length > 0 && <span className="claude-ok">{hechas}/{s.tareas.length} completadas</span>}
        </div>
        {s.activoDesde && (
          <div className="ctab-viva claude-viva"><span className="ctab-pulso" /> Trabajando ahora: {s.activoPedido || '…'}</div>
        )}
      </header>

      {s.resumen && <p className="claude-resumen">{s.resumen}</p>}

      {s.tareas.length > 0 && (
        <ul className="claude-tareas">
          {tareasSesion.map((t) => {
            const col = COLUMNA[columnaDe(t)]
            return (
              <li key={t.id}>
                <button onClick={() => alAbrir(t.id)}>
                  {t.hecha ? <CheckCircle2 size={18} className="claude-ok" /> : <CircleDashed size={18} className={col.clase} />}
                  <span className="claude-tarea-titulo">{t.titulo}</span>
                  <span className={`claude-tarea-estado ${col.clase}`}>{col.nombre}</span>
                </button>
                {columnaDe(t) === 'review' && (
                  <button className="ctab-boton ctab-boton--ok claude-completar" onClick={() => completar(t)}><Check size={14} /> Completar</button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="claude-pie">
        {s.sinProcesar > 0 && (
          s.procesarPedido
            ? <span className="claude-cola">En cola · {s.sinProcesar} sin procesar</span>
            : <Boton variante="secundario" pequeno icono={<RefreshCw size={15} />} onClick={alProcesar}>Procesar {s.sinProcesar}</Boton>
        )}
        <button className="claude-ver" onClick={() => setAbierta(!abierta)} aria-expanded={abierta}>
          {abierta ? 'Ocultar pasos' : 'Ver pasos'} <ChevronDown size={16} className={abierta ? 'claude-girado' : ''} />
        </button>
      </div>

      {abierta && (
        <ol className="claude-pasos">
          {s.pasos.map((p) => {
            const herramientas = Object.entries(p.herramientas).sort((a, b) => b[1] - a[1])
            return (
              <li key={p.id} className={p.tareaId ? '' : 'claude-paso--suelto'}>
                <div className="claude-paso-hora">{hora(p.inicio)}</div>
                <div className="claude-paso-cuerpo">
                  <div className="claude-paso-pedido">{p.pedido}</div>
                  {(herramientas.length > 0 || p.archivos.length > 0) && (
                    <div className="claude-paso-chips">
                      {herramientas.slice(0, 5).map(([n, c]) => <span key={n}>{n === 'Bash' ? <Terminal size={11} /> : null}{n} {c}</span>)}
                      {p.archivos.length > 0 && <span title={p.archivos.join('\n')}><FileText size={11} />{p.archivos.length} archivos</span>}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
