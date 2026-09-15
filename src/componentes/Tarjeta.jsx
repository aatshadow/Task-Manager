import { motion } from 'framer-motion'

// Tres variantes del mockup: normal (#1f1f1f), calida (degradado con brillo) y naranja (lo activo).
// `elevada` es la cuarta superficie (#262626) para tarjetas dentro de tarjetas.
// Si recibe onClick se vuelve pulsable con una respuesta de escala corta.
export default function Tarjeta({
  variante = 'normal',
  elevada = false,
  compacta = false,
  onClick,
  className = '',
  style,
  children,
  ...resto
}) {
  const clases = [
    'tarjeta',
    variante !== 'normal' && `tarjeta--${variante}`,
    elevada && 'tarjeta--elevada',
    compacta && 'tarjeta--compacta',
    onClick && 'tarjeta--interactiva',
    className,
  ].filter(Boolean).join(' ')

  if (!onClick) {
    return <div className={clases} style={style} {...resto}>{children}</div>
  }
  return (
    <motion.div
      className={clases}
      style={style}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e) } }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.12 }}
      {...resto}
    >
      {children}
    </motion.div>
  )
}
