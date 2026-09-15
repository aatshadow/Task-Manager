// Píldora con fondo suave del color que se le dé y un punto delante. Sirve para proyecto,
// categoría, cuadrante y etapa: el color viene del dato, no del componente.
// Con onClick se vuelve un filtro (activo = con borde, inactivo = gris).
export default function Chip({
  children,
  color,
  punto = true,
  activo = false,
  solido = false,
  pequeno = false,
  onClick,
  className = '',
  ...resto
}) {
  const clases = [
    'chip',
    onClick && 'chip--pulsable',
    activo && 'chip--activo',
    solido && 'chip--solido',
    pequeno && 'chip--pequeno',
    className,
  ].filter(Boolean).join(' ')
  const estilo = color ? { '--chip-color': color } : undefined
  const Etiqueta = onClick ? 'button' : 'span'
  return (
    <Etiqueta
      className={clases}
      style={estilo}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      aria-pressed={onClick ? activo : undefined}
      {...resto}
    >
      {punto && <span className="chip-punto" />}
      {children}
    </Etiqueta>
  )
}
