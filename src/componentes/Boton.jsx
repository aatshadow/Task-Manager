import { Loader2 } from 'lucide-react'

// Variantes: primario (píldora naranja), secundario (gris), fantasma (sin fondo), peligro
// e icono (redondo, solo icono; pide aria-label). `cargando` bloquea y enseña un giro.
export default function Boton({
  variante = 'primario',
  icono,
  pequeno = false,
  completo = false,
  cargando = false,
  disabled = false,
  type = 'button',
  className = '',
  children,
  ...resto
}) {
  const clases = [
    'boton',
    `boton--${variante}`,
    icono && !children && 'boton--icono',
    pequeno && 'boton--pequeno',
    completo && 'boton--completo',
    className,
  ].filter(Boolean).join(' ')
  return (
    <button className={clases} type={type} disabled={disabled || cargando} aria-busy={cargando || undefined} {...resto}>
      {cargando ? <Loader2 size={18} strokeWidth={1.75} className="boton-girando" /> : icono}
      {children}
    </button>
  )
}
