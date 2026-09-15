import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Columns3, Plus } from 'lucide-react'
import Selector from '../../componentes/Selector.jsx'
import Chip from '../../componentes/Chip.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import * as datosTareas from '../../datos/tareas.js'
import { cargarTablerosDeCliente } from '../../datos/catalogos.js'
import { textoFecha } from '../../datos/fechas.js'
import { usarGuardar } from '../../estado/usarGuardar.js'

// Un tablero de cliente en el desplegable: `c:<clientId>:<tableroId>`; uno propio: `p:<id>`.
const clavePropio = (p) => `p:${p.id}`
const claveCliente = (clientId, tab) => `c:${clientId}:${tab.id}`

/**
 * Tableros = kanban horizontal (LOGICA §5). Los propios salen de `pipelines` (contexto);
 * los de cliente se leen del portal (`task_pipelines` + `task_stages`, cacheados por
 * cliente en catalogos) para TODOS los clientes: un tablero sin tareas mías sale vacío,
 * pero es la única manera de «Añadir» la primera tarea de un cliente desde aquí. Sólo se
 * enseñan las tareas del portal que están en la vista (mías o seguidas).
 *
 * Mover = `mover(tarea, etapa)`: los dos ejes en una escritura, con el parche optimista
 * de `cambiosAlMover` para que la tarjeta cambie de columna al instante.
 */
export default function Tableros({ tareas }) {
  const { pipelines, clientes, avisar, abrirTarea, nuevaTarea, colorCategoria, nombreCategoria, cuadrantes, hoy } = useDatos()
  const guardar = usarGuardar()

  /* ── tableros de cliente ──────────────────────────────────────────────── */
  const clientesOrdenados = useMemo(
    () => [...clientes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [clientes],
  )
  const claveClientes = clientesOrdenados.map((c) => c.id).join(',')

  const [tablerosCliente, setTablerosCliente] = useState({})   // clientId → [tablero]
  // Depende de la lista de ids (string) y no del array: cada recarga trae un array nuevo
  // y no hay por qué volver a pedir los tableros si los clientes son los mismos.
  useEffect(() => {
    if (!claveClientes) return
    let vivo = true
    Promise.all(claveClientes.split(',').map((id) => cargarTablerosDeCliente(id).then((ts) => [id, ts])))
      .then((pares) => { if (vivo) setTablerosCliente(Object.fromEntries(pares)) })
      .catch((e) => { if (vivo) avisar(e.message, 'error') })
    return () => { vivo = false }
  }, [claveClientes, avisar])

  /* ── el desplegable: propios + «Cliente · nombre» por cada cliente con tablero ── */
  const opciones = useMemo(() => {
    const propios = pipelines.filter((p) => !p.archivadoEn).map((p) => ({ valor: clavePropio(p), etiqueta: p.nombre }))
    const deClientes = clientesOrdenados.flatMap((c) => (tablerosCliente[c.id] || []).map((tab) => ({
      valor: claveCliente(c.id, tab),
      // si el cliente tiene más de un tablero, el nombre del tablero desambigua
      etiqueta: (tablerosCliente[c.id] || []).length > 1 ? `Cliente · ${c.nombre} · ${tab.nombre}` : `Cliente · ${c.nombre}`,
    })))
    return [...propios, ...deClientes]
  }, [pipelines, clientesOrdenados, tablerosCliente])

  const [elegido, setElegido] = useState(null)
  const porDefecto = pipelines.find((p) => p.esDefault && !p.archivadoEn) || pipelines.find((p) => !p.archivadoEn) || null
  const valor = opciones.some((o) => o.valor === elegido) ? elegido : (porDefecto ? clavePropio(porDefecto) : opciones[0]?.valor || null)

  /* ── el tablero activo: sus etapas y sus tareas ───────────────────────── */
  const activo = useMemo(() => {
    if (!valor) return null
    if (valor.startsWith('p:')) {
      const p = pipelines.find((x) => clavePropio(x) === valor)
      if (!p) return null
      return {
        etapas: p.etapas,
        // la captura rápida crea en el pipeline por defecto: en otro pipeline no se ofrece
        // «Añadir» porque la tarea no aparecería aquí
        prefill: p.esDefault ? {} : null,
        tareas: tareas.filter((t) => t.origen === 'hoy' && (t.pipelineId === p.id || (!t.pipelineId && p.esDefault))),
      }
    }
    const [, clientId, tabId] = valor.split(':')
    const tab = (tablerosCliente[clientId] || []).find((x) => x.id === tabId)
    if (!tab) return null
    return {
      etapas: tab.etapas,
      // `crear` mete la tarea en el tablero POR DEFECTO del cliente: en otro tablero no se
      // ofrece «Añadir» porque la tarea nueva no aparecería en esta columna
      prefill: tab.esDefault ? { clientId } : null,
      tareas: tareas.filter((t) => t.origen === 'portal' && t.clientId === clientId && (t.pipelineId === tab.id || (!t.pipelineId && tab.esDefault))),
    }
  }, [valor, pipelines, tablerosCliente, tareas])

  const columnas = useMemo(() => {
    if (!activo) return []
    const etapas = [...activo.etapas].sort((a, b) => a.posicion - b.posicion)
    const cols = etapas.map((e) => ({ etapa: e, tareas: [] }))
    const sinColumna = []
    for (const t of activo.tareas) {
      const c = cols.find((x) => x.etapa.id === t.etapaId)
      if (c) c.tareas.push(t); else sinColumna.push(t)
    }
    for (const c of cols) c.tareas.sort((a, b) => a.posicion - b.posicion)
    // Las que no caen en ninguna etapa (etapa borrada, o sin columna) se enseñan aparte:
    // que no desaparezcan. Sólo pueden entrar a la primera columna con «›».
    if (sinColumna.length) cols.push({ etapa: null, tareas: sinColumna })
    return cols
  }, [activo])

  const moverA = (t, etapa) => {
    if (!etapa || etapa.id === t.etapaId) return
    guardar(t, datosTareas.cambiosAlMover(etapa), () => datosTareas.mover(t, etapa))
  }

  if (!opciones.length) {
    return <Vacio icono={Columns3} titulo="Sin tableros" texto="Crea un pipeline en Ajustes; los de los clientes de GrowthInfo salen solos." />
  }

  const etapasReales = columnas.filter((c) => c.etapa).map((c) => c.etapa)

  return (
    <div className="tableros">
      <Selector modo="desplegable" opciones={opciones} valor={valor} alCambiar={(v) => v && setElegido(v)} placeholder="Tablero" className="tableros-selector" />

      {!activo ? (
        <Vacio icono={Columns3} titulo="Cargando tablero…" />
      ) : !columnas.length ? (
        <Vacio icono={Columns3} titulo="Sin columnas" texto="Este tablero no tiene etapas todavía." />
      ) : (
        <div className="kanban">
          {columnas.map((col, i) => {
            const e = col.etapa
            const anterior = e ? etapasReales[i - 1] : null
            const siguiente = e ? etapasReales[i + 1] : etapasReales[0]
            return (
              <section key={e ? e.id : 'sin'} className="kanban-columna" aria-label={e ? e.nombre : 'Sin columna'}>
                <header className="kanban-cabecera">
                  <span className="kanban-punto" style={{ background: e?.color || 'var(--texto-3)' }} />
                  <span className="kanban-nombre">{e ? e.nombre : 'Sin columna'}</span>
                  <span className="kanban-cuenta">{col.tareas.length}</span>
                </header>
                <div className="kanban-tarjetas">
                  <AnimatePresence initial={false}>
                    {col.tareas.map((t) => (
                      <motion.article
                        key={t.id}
                        layout="position"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                        transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                        className={`kanban-tarjeta ${t.hecha ? 'kanban-tarjeta--hecha' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => abrirTarea(t.id)}
                        onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrirTarea(t.id) } }}
                      >
                        <div className="kanban-tarjeta-titulo">{t.titulo}</div>
                        {(t.categoria || t.cuadrante || t.vence) && (
                          <div className="kanban-tarjeta-meta">
                            {t.categoria && <Chip color={colorCategoria(t.categoria) || 'var(--texto-2)'} pequeno>{nombreCategoria(t.categoria)}</Chip>}
                            {t.cuadrante && cuadrantes[t.cuadrante] && <Chip color={cuadrantes[t.cuadrante].color} pequeno punto>{t.cuadrante.toUpperCase()}</Chip>}
                            {t.vence && (
                              <span className={`fila-tarea-vence ${datosTareas.esAtrasada(t, hoy) ? 'fila-tarea-vence--atrasada' : ''}`}>{textoFecha(t.vence)}</span>
                            )}
                          </div>
                        )}
                        <div className="kanban-tarjeta-mover" onClick={(ev) => ev.stopPropagation()} onKeyDown={(ev) => ev.stopPropagation()}>
                          <button type="button" className="kanban-flecha" disabled={!anterior} onClick={() => moverA(t, anterior)} aria-label={anterior ? `Mover a ${anterior.nombre}` : 'Primera columna'}>
                            <ChevronLeft size={16} strokeWidth={1.75} />
                          </button>
                          <span className="kanban-tarjeta-etapa">{e ? '' : 'sin columna'}</span>
                          <button type="button" className="kanban-flecha" disabled={!siguiente} onClick={() => moverA(t, siguiente)} aria-label={siguiente ? `Mover a ${siguiente.nombre}` : 'Última columna'}>
                            <ChevronRight size={16} strokeWidth={1.75} />
                          </button>
                        </div>
                      </motion.article>
                    ))}
                  </AnimatePresence>
                  {!col.tareas.length && <div className="kanban-vacia">Nada aquí</div>}
                </div>
                {e && i === 0 && activo.prefill && (
                  <button type="button" className="kanban-anadir" onClick={() => nuevaTarea(activo.prefill)}>
                    <Plus size={16} strokeWidth={1.75} /> Añadir
                  </button>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
