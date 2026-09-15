import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

// Toast breve arriba, ceñido a la columna. Sirve para errores (se quedan más) y para
// confirmaciones («Añadida»). Es presentacional: quien lo monta le da `texto` y `tipo`
// (normalmente App, con el `aviso` del contexto) y lo quita con `alCerrar`.
// Va en portal a <body> por encima de las hojas: un error al guardar dentro de la hoja
// tiene que verse encima de la hoja.
const ICONOS = { error: AlertCircle, ok: CheckCircle2, info: Info }
const DURACION = { error: 5200, ok: 2600, info: 3200 }

export default function Aviso({ id, texto, tipo = 'info', alCerrar, duracion }) {
  const visible = Boolean(texto)

  // Se reprograma con cada aviso nuevo (`id` cambia aunque el texto sea el mismo).
  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => alCerrar?.(), duracion ?? DURACION[tipo] ?? DURACION.info)
    return () => clearTimeout(t)
  }, [id, texto, tipo, visible, duracion, alCerrar])

  const Icono = ICONOS[tipo] || Info
  return createPortal(
    <div className="aviso-zona" aria-live="polite">
      <AnimatePresence>
        {visible && (
          <motion.div
            key={id ?? texto}
            className={`aviso aviso--${tipo}`}
            role={tipo === 'error' ? 'alert' : 'status'}
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <span className="aviso-icono"><Icono size={18} strokeWidth={1.75} /></span>
            <span className="aviso-texto">{texto}</span>
            <button type="button" className="aviso-cerrar" onClick={alCerrar} aria-label="Cerrar aviso">
              <X size={16} strokeWidth={1.75} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  )
}
