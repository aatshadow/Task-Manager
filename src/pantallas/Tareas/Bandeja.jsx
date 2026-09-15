import { useMemo } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Inbox, ChevronDown } from 'lucide-react'
import Chip from '../../componentes/Chip.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import FilaTarea from './FilaTarea.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import * as datosTareas from '../../datos/tareas.js'
import { usarGuardar } from '../../estado/usarGuardar.js'

/**
 * Bandeja = lo capturado sin triar (LOGICA §3.3): sin proyecto y sin cuadrante. El triaje
 * se hace en la propia fila: un cuadrante o un proyecto y la tarea sale sola de aquí,
 * porque «estar en bandeja» es derivado, no un estado.
 *
 * Casi todo es personal, pero el portal también tiene tareas «de la casa» (sin cliente):
 * si una me toca, entra en la vista sin proyecto y cumple `esBandeja`. A esa no se le
 * puede dar proyecto propio (§4: una del portal no cambia de dueño desde 2day, y
 * `actualizar` ignoraría `proyectoId` sin decir nada), así que sólo se tría por cuadrante
 * y se marca de dónde viene.
 */
export default function Bandeja({ tareas }) {
  const { hoy, ajustes, proyectos, listaCuadrantes } = useDatos()
  const guardar = usarGuardar()

  const lista = useMemo(() => [...tareas].sort((a, b) => (a.creadaEn < b.creadaEn ? -1 : 1)), [tareas])

  const triarCuadrante = (t, q) => guardar(t, { cuadrante: q }, async () => {
    const c = await datosTareas.capa(t.id, t.origen, { cuadrante: q })
    return { ...t, cuadrante: c.cuadrante }
  })
  const triarProyecto = (t, id) => guardar(t, { proyectoId: id }, () => datosTareas.actualizar(t, { proyectoId: id }))

  if (!lista.length) {
    return <Vacio icono={Inbox} titulo="Bandeja vacía" texto="Lo que captures con el «+» aparece aquí hasta que lo tries." />
  }

  return (
    <div className="tareas-lista">
      <AnimatePresence initial={false}>
        {lista.map((t) => {
          const dias = datosTareas.diasEnBandeja(t, hoy)
          const encendida = datosTareas.bandejaEncendida(t, ajustes, hoy)
          const delPortal = t.origen === 'portal'
          return (
            <FilaTarea
              key={t.id}
              tarea={t}
              meta={(
                <div className="fila-tarea-meta">
                  <span className={`bandeja-dias ${encendida ? 'bandeja-dias--encendida' : ''}`}>
                    {dias === 0 ? 'hoy' : dias === 1 ? 'hace 1 día' : `hace ${dias} días`}
                  </span>
                </div>
              )}
              debajo={(
                <div className="bandeja-triaje">
                  <div className="bandeja-cuadrantes" role="group" aria-label="Cuadrante">
                    {listaCuadrantes.map((q) => (
                      <Chip key={q.clave} color={q.color} pequeno onClick={() => triarCuadrante(t, q.clave)} aria-label={q.nombre} title={q.nombre}>
                        {q.clave.toUpperCase()}
                      </Chip>
                    ))}
                  </div>
                  {delPortal ? (
                    <Chip color="var(--acento)" pequeno className="bandeja-origen">GrowthInfo</Chip>
                  ) : (
                    <label className="bandeja-proyecto">
                      <span className="oculto-visual">Proyecto</span>
                      <select value="" onChange={(e) => { if (e.target.value) triarProyecto(t, e.target.value) }} disabled={!proyectos.length}>
                        <option value="" disabled>{proyectos.length ? 'Proyecto…' : 'Sin proyectos'}</option>
                        {proyectos.map((p) => <option key={p.id} value={p.id}>{p.icono ? `${p.icono} ` : ''}{p.nombre}</option>)}
                      </select>
                      <ChevronDown size={14} strokeWidth={1.75} />
                    </label>
                  )}
                </div>
              )}
            />
          )
        })}
      </AnimatePresence>
    </div>
  )
}
