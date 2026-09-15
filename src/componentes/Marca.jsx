import { motion, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'

// El círculo de completar. Aro secundario; al marcar se rellena de naranja con un check
// y un rebote corto. Para el stopPropagation: vive dentro de filas que también son pulsables.
export default function Marca({ hecha = false, alCambiar, color, grande = false, className = '', ...resto }) {
  const sinMovimiento = useReducedMotion()
  const clases = ['marca', hecha && 'marca--hecha', grande && 'marca--grande', className].filter(Boolean).join(' ')
  const tamanoCheck = grande ? 22 : 14
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={hecha}
      className={clases}
      style={color ? { '--marca-color': color } : undefined}
      onClick={e => { e.stopPropagation(); alCambiar?.(!hecha) }}
      {...resto}
    >
      <motion.span
        className="marca-relleno"
        initial={false}
        animate={{ scale: hecha ? 1 : 0 }}
        transition={sinMovimiento ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 26 }}
      />
      <motion.span
        className="marca-check"
        initial={false}
        animate={{ scale: hecha ? 1 : 0.4, opacity: hecha ? 1 : 0 }}
        transition={{ duration: sinMovimiento ? 0 : 0.18, delay: hecha && !sinMovimiento ? 0.05 : 0 }}
      >
        <Check size={tamanoCheck} strokeWidth={2.5} />
      </motion.span>
    </button>
  )
}
