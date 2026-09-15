import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'

// El «+» naranja flotante, abajo a la derecha por encima de la nav. Se ciñe a la columna de
// 430px para que en escritorio no se vaya a la esquina de la ventana.
export default function FAB({ alPulsar, etiqueta = 'Nueva tarea', icono }) {
  return (
    <div className="fab-zona">
      <div className="fab-zona-interior">
        <motion.button
          className="fab"
          aria-label={etiqueta}
          onClick={alPulsar}
          whileTap={{ scale: 0.92 }}
          transition={{ duration: 0.12 }}
        >
          {icono || <Plus size={26} strokeWidth={2} />}
        </motion.button>
      </div>
    </div>
  )
}
