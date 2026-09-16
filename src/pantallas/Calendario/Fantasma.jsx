import { forwardRef } from 'react'
import { createPortal } from 'react-dom'
import { deMinutos } from '../../datos/fechas.js'

/**
 * La tarjeta que viaja con el dedo mientras se arrastra una tarea (LOGICA §5.1). Va en un
 * portal a <body> con `position: fixed`: la vista está dentro de un `motion.div` con
 * transform y un fijo ahí dentro se quedaría atrapado. Su posición y ancho los pone el hook
 * directamente en `style` (sin render por movimiento); aquí sólo se pinta el contenido.
 *
 * `variante`: naranja sobre la pista (va a aterrizar), cálida en el aire, apagada sobre
 * «Todo el día» (va a perder la hora).
 */
const Fantasma = forwardRef(function Fantasma({ vuelo, proyecto }, ref) {
  if (!vuelo) return null
  const { tarea, alto, minutos, sobre, duracion } = vuelo
  const enPista = sobre === 'pista' && minutos != null
  const horas = enPista
    ? `${deMinutos(minutos)}${duracion ? ` – ${deMinutos(minutos + duracion)}` : ''}`
    : sobre === 'lista' ? 'Sin hora' : '…'
  const clase = [
    'tarjeta', 'tarjeta--compacta', 'cal-evento', 'cal-fantasma',
    enPista ? 'tarjeta--naranja' : sobre === 'lista' ? 'cal-fantasma--sin-hora' : 'tarjeta--calida',
    alto < 48 && 'cal-evento--corta',
  ].filter(Boolean).join(' ')

  return createPortal(
    <div ref={ref} className={clase} style={{ height: alto }} aria-hidden="true">
      <div className="cal-evento-titulo">{tarea.titulo}</div>
      {alto >= 48 && (
        <div className="cal-evento-meta t-secundario">
          <strong className="cal-fantasma-hora">{horas}</strong>
          {proyecto ? ` · ${proyecto}` : ''}
        </div>
      )}
    </div>,
    document.body,
  )
})

export default Fantasma
