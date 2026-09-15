import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * La cabecera del mockup: «← Sep   Octubre   Nov →». El centro es el período que se ve
 * (mes, semana o día) y los lados el anterior y el siguiente, pulsables. `direccion`
 * dice hacia dónde se deslizó el título (+1 adelante, −1 atrás) para animar la entrada.
 */
export default function CabeceraPeriodo({ anterior, titulo, siguiente, direccion = 1, alAnterior, alSiguiente, mostrarHoy = false, alHoy }) {
  return (
    <div className="cal-cabecera">
      <button className="cal-cabecera-lado" onClick={alAnterior} aria-label={`Ir a ${anterior}`}>
        <ChevronLeft size={18} strokeWidth={1.75} />
        <span>{anterior}</span>
      </button>

      <div className="cal-cabecera-centro">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={titulo}
            className={`cal-cabecera-titulo ${titulo.length > 18 ? 'cal-cabecera-titulo--largo' : ''}`}
            initial={{ opacity: 0, x: 14 * direccion }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 * direccion }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {titulo}
          </motion.span>
        </AnimatePresence>
        {mostrarHoy && (
          <button className="cal-cabecera-hoy" onClick={alHoy}>Hoy</button>
        )}
      </div>

      <button className="cal-cabecera-lado cal-cabecera-lado--derecha" onClick={alSiguiente} aria-label={`Ir a ${siguiente}`}>
        <span>{siguiente}</span>
        <ChevronRight size={18} strokeWidth={1.75} />
      </button>
    </div>
  )
}
