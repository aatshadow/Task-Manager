import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import './Tareas.css'
import Pestanas from '../../componentes/Pestanas.jsx'
import Bandeja from './Bandeja.jsx'
import Siguiente from './Siguiente.jsx'
import Tableros from './Tableros.jsx'
import Explorar from './Explorar.jsx'
import Nevera from './Nevera.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import { esBandeja, esNevera, esViva } from '../../datos/tareas.js'

// La pestaña activa sobrevive al cambio de pantalla (la nav desmonta Tareas): volver
// del detalle de Hoy a Tableros y encontrarse Bandeja es un pequeño castigo.
let ultimaPestana = 'bandeja'

/**
 * TAREAS (LOGICA §5): cinco pestañas sobre la misma lista del contexto. Cada pestaña es
 * una pregunta derivada (bandeja, nevera, viva…), nunca un estado guardado; por eso
 * una tarea cambia de pestaña sola cuando se le da cuadrante, fecha o proyecto.
 *
 * La nevera se calcula primero y se resta de Bandeja y Siguiente: una tarea congelada
 * «desaparece de las listas» (§3.4), la revisión es la única que la enseña.
 */
export default function Tareas() {
  const { tareas, ajustes, hoy } = useDatos()
  const [pestana, setPestanaEstado] = useState(ultimaPestana)
  const setPestana = (p) => { ultimaPestana = p; setPestanaEstado(p) }

  const { bandeja, siguiente, nevera } = useMemo(() => {
    const nevera = [], bandeja = [], siguiente = []
    for (const t of tareas) {
      if (!esViva(t)) continue
      if (esNevera(t, ajustes, hoy)) { nevera.push(t); continue }
      if (esBandeja(t)) bandeja.push(t)
      siguiente.push(t)
    }
    return { bandeja, siguiente, nevera }
  }, [tareas, ajustes, hoy])

  const opciones = [
    { valor: 'bandeja', etiqueta: 'Bandeja', cuenta: bandeja.length },
    { valor: 'siguiente', etiqueta: 'Siguiente', cuenta: siguiente.length },
    { valor: 'tableros', etiqueta: 'Tableros' },
    { valor: 'growthinfo', etiqueta: 'GrowthInfo' },
    { valor: 'nevera', etiqueta: 'Nevera', cuenta: nevera.length },
  ]

  return (
    <div className="pantalla tareas">
      {/* El envoltorio pinta un desvanecido a la derecha: a 390px no caben las cinco y sin
          scrollbar nadie sabría que Nevera existe. */}
      <div className="tareas-pestanas">
        <Pestanas opciones={opciones} valor={pestana} alCambiar={setPestana} />
      </div>
      {/* Solo entrada, sin AnimatePresence: anidar un `mode="wait"` dentro del de App.jsx
          bloqueaba el cambio de pantalla (ver el comentario de App.jsx). */}
      <motion.div
        key={pestana}
        className="tareas-cuerpo"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {pestana === 'bandeja' && <Bandeja tareas={bandeja} />}
        {pestana === 'siguiente' && <Siguiente tareas={siguiente} />}
        {pestana === 'tableros' && <Tableros tareas={tareas} />}
        {pestana === 'growthinfo' && <Explorar />}
        {pestana === 'nevera' && <Nevera tareas={nevera} />}
      </motion.div>
    </div>
  )
}
