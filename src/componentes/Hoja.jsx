import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useDragControls } from 'framer-motion'

// Bottom sheet. Sube desde abajo, fondo oscurecido, asa arriba y arrastre hacia abajo para
// cerrar. El arrastre solo lo inicia el asa/cabecera (dragListener=false): así el cuerpo
// puede hacer scroll interno sin pelearse con el gesto. Altura auto, máximo 92vh.
// Va en un portal a <body> para que ningún transform de la pantalla la atrape.
export default function Hoja({ abierta, alCerrar, titulo, pie, children }) {
  const controles = useDragControls()

  // bloqueo del scroll de la página y cierre con Escape mientras está abierta
  useEffect(() => {
    if (!abierta) return
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const alTeclear = e => { if (e.key === 'Escape') alCerrar?.() }
    window.addEventListener('keydown', alTeclear)
    return () => {
      document.body.style.overflow = anterior
      window.removeEventListener('keydown', alTeclear)
    }
  }, [abierta, alCerrar])

  return createPortal(
    <AnimatePresence>
      {abierta && (
        <>
          <motion.div
            className="hoja-fondo"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={alCerrar}
          />
          <motion.div
            className="hoja"
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            initial={{ y: '100%', x: '-50%' }}
            animate={{ y: 0, x: '-50%' }}
            exit={{ y: '100%', x: '-50%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.9 }}
            drag="y"
            dragControls={controles}
            dragListener={false}
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 1 }}
            dragSnapToOrigin
            onDragEnd={(_, info) => {
              // un tirón corto pero rápido también cierra: es lo que espera el pulgar
              if (info.offset.y > 110 || info.velocity.y > 600) alCerrar?.()
            }}
          >
            <div className="hoja-asa-zona" onPointerDown={e => controles.start(e)}>
              <span className="hoja-asa" />
              {titulo && <h2 className="hoja-titulo">{titulo}</h2>}
            </div>
            <div className="hoja-cuerpo">{children}</div>
            {pie && <div className="hoja-pie">{pie}</div>}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
