import { motion } from 'framer-motion'

// Las secciones de un espacio (LOGICA §18.1) como pestañas de texto bajo la cabecera. La raya
// blanca se desliza a la activa. Con una sola sección no se pinta nada.
export default function SubNav({ secciones = [], activa, alCambiar }) {
  if (secciones.length < 2) return null
  return (
    <nav className="subnav" aria-label="Secciones">
      {secciones.map(({ clave, etiqueta }) => {
        const esActiva = clave === activa
        return (
          <button
            key={clave}
            type="button"
            className={`subnav-item${esActiva ? ' subnav-item--activa' : ''}`}
            aria-current={esActiva ? 'page' : undefined}
            onClick={() => alCambiar?.(clave)}
          >
            {etiqueta}
            {esActiva && <motion.span className="subnav-raya" layoutId="subnav-raya" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          </button>
        )
      })}
    </nav>
  )
}
