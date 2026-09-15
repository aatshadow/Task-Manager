import { useMemo } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Snowflake, ArrowUpRight, Archive } from 'lucide-react'
import Boton from '../../componentes/Boton.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import FilaTarea from './FilaTarea.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import * as datosTareas from '../../datos/tareas.js'
import { diasEntre, sumarDias } from '../../datos/fechas.js'
import { usarGuardar } from '../../estado/usarGuardar.js'

const DIAS_DE_MARGEN = 7

/**
 * Nevera = la revisión de «algún día» (LOGICA §3.4): lo que lleva `dias_nevera` sin tocar,
 * sin fecha y sin estar en Hoy. Dos salidas y ninguna más: sigue o muere.
 *
 * «Sigue» pone `vence = hoy + 7` y no `hoy_para`: planificarla para Hoy sólo escribe la
 * capa, el reinicio del día le quita el `hoy_para` a la mañana siguiente y, como
 * `updated_at` de la tarea no cambió, volvería a la nevera. Una fecha la saca de verdad.
 */
export default function Nevera({ tareas }) {
  const { hoy, quitarLocal, avisar, nombreProyecto, colorProyecto } = useDatos()
  const guardar = usarGuardar()

  // Las más olvidadas primero: son las que más piden una decisión.
  const lista = useMemo(() => [...tareas].sort((a, b) => ((a.actualizadaEn || a.creadaEn) < (b.actualizadaEn || b.creadaEn) ? -1 : 1)), [tareas])

  const sigue = (t) => {
    const vence = sumarDias(hoy, DIAS_DE_MARGEN)
    return guardar(t, { vence, actualizadaEn: new Date().toISOString() }, () => datosTareas.actualizar(t, { vence }))
  }
  const muere = async (t) => {
    const nueva = await guardar(t, { archivadoEn: new Date().toISOString() }, () => datosTareas.archivar(t, true))
    if (nueva?.archivadoEn) { quitarLocal(t.id); avisar('Archivada', 'ok') }
  }

  if (!lista.length) {
    return <Vacio icono={Snowflake} titulo="Nevera vacía" texto="Lo que lleve semanas sin tocarse, sin fecha y fuera de Hoy, acaba aquí." />
  }

  return (
    <div className="tareas-lista">
      <AnimatePresence initial={false}>
        {lista.map((t) => {
          // `diasEntre` ya traduce el timestamp a su día local: la misma cuenta que `esNevera`.
          const dias = diasEntre(t.actualizadaEn || t.creadaEn, hoy)
          const proyecto = nombreProyecto(t)
          return (
            <FilaTarea
              key={t.id}
              tarea={t}
              meta={(
                <div className="fila-tarea-meta">
                  {proyecto && <span className="nevera-proyecto" style={{ color: colorProyecto(t) || 'var(--texto-2)' }}>{proyecto}</span>}
                  <span className="nevera-dias">sin tocar {dias} {dias === 1 ? 'día' : 'días'}</span>
                </div>
              )}
              debajo={(
                <div className="nevera-acciones">
                  <Boton variante="secundario" pequeno icono={<ArrowUpRight size={15} strokeWidth={1.75} />} onClick={() => sigue(t)}>Sigue</Boton>
                  <Boton variante="fantasma" pequeno icono={<Archive size={15} strokeWidth={1.75} />} onClick={() => muere(t)} className="nevera-muere">Muere</Boton>
                </div>
              )}
            />
          )
        })}
      </AnimatePresence>
    </div>
  )
}
