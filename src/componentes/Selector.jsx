import { useId } from 'react'
import { ChevronDown } from 'lucide-react'
import Chip from './Chip.jsx'

// Elegir una opción entre varias. `opciones` = [{ valor, etiqueta, color? }].
// modo 'chips' (pocas opciones: cuadrante, categoría) o 'desplegable' (muchas: proyecto,
// responsable) con el <select> nativo estilizado: el teclado del móvil ya lo hace bien.
export default function Selector({
  etiqueta,
  opciones = [],
  valor,
  alCambiar,
  modo = 'chips',
  placeholder = 'Elegir…',
  permitirVacio = false,
  className = '',
}) {
  const id = useId()

  if (modo === 'desplegable') {
    return (
      <div className={`selector selector-desplegable campo ${className}`}>
        {etiqueta && <label className="campo-etiqueta" htmlFor={id}>{etiqueta}</label>}
        <div className="campo-caja">
          <select id={id} value={valor ?? ''} onChange={e => alCambiar?.(e.target.value || null)}>
            <option value="" disabled={!permitirVacio}>{placeholder}</option>
            {opciones.map(o => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
          </select>
          <span className="campo-icono"><ChevronDown size={18} strokeWidth={1.75} /></span>
        </div>
      </div>
    )
  }

  return (
    <div className={`selector ${className}`} role="radiogroup" aria-label={etiqueta}>
      {etiqueta && <div className="campo-etiqueta">{etiqueta}</div>}
      <div className="selector-chips">
        {opciones.map(o => {
          const activo = o.valor === valor
          return (
            <Chip
              key={o.valor}
              color={o.color || 'var(--acento)'}
              activo={activo}
              role="radio"
              aria-checked={activo}
              // volver a tocar la activa la quita si el campo admite vacío
              onClick={() => alCambiar?.(activo && permitirVacio ? null : o.valor)}
            >
              {o.etiqueta}
            </Chip>
          )
        })}
      </div>
    </div>
  )
}
