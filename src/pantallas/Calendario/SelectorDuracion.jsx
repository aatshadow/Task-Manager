import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

/** Las siete duraciones del selector rápido (LOGICA §5.1), en minutos. */
export const DURACIONES = [
  { minutos: 5, etiqueta: '5m' },
  { minutos: 15, etiqueta: '15m' },
  { minutos: 30, etiqueta: '30m' },
  { minutos: 45, etiqueta: '45m' },
  { minutos: 60, etiqueta: '1h' },
  { minutos: 90, etiqueta: '1h30' },
  { minutos: 120, etiqueta: '2h' },
]

/**
 * «¿Cuánto?» — aparece pegado a la tarjeta recién soltada cuando la tarea no tenía duración.
 * Vive DENTRO de la pista (absoluto, en píxeles del timeline) para irse con ella si la
 * página hace scroll. `arriba` lo coloca encima de la tarjeta cuando debajo no hay sitio.
 * Se cierra tocando fuera o con Escape; entonces la tarea se queda sólo con hora de inicio.
 */
export default function SelectorDuracion({ top, arriba = false, alElegir, alCerrar }) {
  const ref = useRef(null)

  useEffect(() => {
    const fuera = (e) => { if (!ref.current?.contains(e.target)) alCerrar() }
    const tecla = (e) => { if (e.key === 'Escape') alCerrar() }
    // en el siguiente tick: el pointerup que soltó la tarjeta no debe cerrarlo antes de nacer
    const id = setTimeout(() => {
      document.addEventListener('pointerdown', fuera)
      window.addEventListener('keydown', tecla)
    }, 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('pointerdown', fuera)
      window.removeEventListener('keydown', tecla)
    }
  }, [alCerrar])

  return (
    <motion.div
      ref={ref}
      className={`cal-duracion${arriba ? ' cal-duracion--arriba' : ''}`}
      style={{ top }}
      role="group"
      aria-label="Duración"
      initial={{ opacity: 0, scale: 0.94, y: arriba ? 6 : -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: arriba ? 4 : -4 }}
      transition={{ type: 'spring', stiffness: 520, damping: 32, mass: 0.7 }}
    >
      <span className="cal-duracion-titulo">¿Cuánto?</span>
      <div className="cal-duracion-chips">
        {DURACIONES.map((d) => (
          <button key={d.minutos} type="button" className="cal-duracion-chip" onClick={() => alElegir(d.minutos)}>
            {d.etiqueta}
          </button>
        ))}
      </div>
    </motion.div>
  )
}
