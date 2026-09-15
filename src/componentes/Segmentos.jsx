import { useId } from 'react'
import { motion } from 'framer-motion'

// Selector segmentado (día / semana / mes · 7 / 30 / 90). El fondo del activo se desliza.
// `opciones` = [{ valor, etiqueta }]. `naranja` pinta el activo con el acento.
export default function Segmentos({ opciones = [], valor, alCambiar, naranja = false, className = '' }) {
  // un layoutId por instancia: dos Segmentos en la misma pantalla no deben compartir el fondo
  const idCapa = useId()
  return (
    <div className={`segmentos ${naranja ? 'segmentos--naranja' : ''} ${className}`} role="tablist">
      {opciones.map(o => {
        const activo = o.valor === valor
        return (
          <button
            key={o.valor}
            role="tab"
            aria-selected={activo}
            className={`segmento ${activo ? 'segmento--activo' : ''}`}
            onClick={() => alCambiar?.(o.valor)}
          >
            {activo && (
              <motion.span
                className="segmento-fondo"
                layoutId={`segmento-${idCapa}`}
                transition={{ type: 'spring', stiffness: 480, damping: 38 }}
              />
            )}
            <span className="segmento-texto">{o.etiqueta}</span>
          </button>
        )
      })}
    </div>
  )
}
