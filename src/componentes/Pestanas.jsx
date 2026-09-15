import { useEffect, useId, useRef } from 'react'
import { motion } from 'framer-motion'

// Pestañas horizontales con scroll (Bandeja · Siguiente · Tableros · Explorar · Nevera).
// `opciones` = [{ valor, etiqueta, cuenta? }]. La activa lleva la línea naranja debajo y
// se trae a la vista sola cuando cambia.
export default function Pestanas({ opciones = [], valor, alCambiar, className = '' }) {
  const idCapa = useId()
  const contenedor = useRef(null)

  useEffect(() => {
    const activa = contenedor.current?.querySelector('.pestana--activa')
    activa?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [valor])

  return (
    <div className={`pestanas ${className}`} role="tablist" ref={contenedor}>
      {opciones.map(o => {
        const activa = o.valor === valor
        return (
          <button
            key={o.valor}
            role="tab"
            aria-selected={activa}
            className={`pestana ${activa ? 'pestana--activa' : ''}`}
            onClick={() => alCambiar?.(o.valor)}
          >
            {o.etiqueta}
            {o.cuenta != null && o.cuenta !== 0 && <span className="pestana-cuenta">{o.cuenta}</span>}
            {activa && (
              <motion.span
                className="pestana-linea"
                layoutId={`pestana-${idCapa}`}
                transition={{ type: 'spring', stiffness: 480, damping: 38 }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
