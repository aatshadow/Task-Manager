import { useId, useState } from 'react'
import { ChevronDown, Plus, Check } from 'lucide-react'
import Chip from './Chip.jsx'

// Elegir una opción entre varias. `opciones` = [{ valor, etiqueta, color? }].
// modo 'chips' (pocas opciones: cuadrante, categoría) o 'desplegable' (muchas: proyecto,
// responsable) con el <select> nativo estilizado: el teclado del móvil ya lo hace bien.
// Con `alCrear(nombre)`, los chips acaban en «+ Nueva»: se escribe, se crea y queda elegida.
export default function Selector({
  etiqueta,
  opciones = [],
  valor,
  alCambiar,
  modo = 'chips',
  placeholder = 'Elegir…',
  permitirVacio = false,
  className = '',
  alCrear,
  textoNueva = 'Nueva',
}) {
  const id = useId()
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  const crear = async () => {
    const limpio = nombre.trim()
    if (!limpio) return setCreando(false)
    const existente = opciones.find(o => String(o.etiqueta).toLowerCase() === limpio.toLowerCase())
    if (existente) alCambiar?.(existente.valor)
    else { await alCrear(limpio); alCambiar?.(limpio) }
    setNombre('')
    setCreando(false)
  }

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
        {alCrear && !creando && (
          <Chip punto={false} onClick={() => setCreando(true)} className="chip--nueva"><Plus size={13} strokeWidth={2} /> {textoNueva}</Chip>
        )}
        {alCrear && creando && (
          <span className="selector-nueva">
            <input
              autoFocus
              value={nombre}
              placeholder={`${textoNueva}…`}
              onChange={e => setNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); crear() } if (e.key === 'Escape') setCreando(false) }}
              onBlur={() => { if (!nombre.trim()) setCreando(false) }}
              maxLength={40}
            />
            <button type="button" aria-label="Crear" onMouseDown={e => e.preventDefault()} onClick={crear}><Check size={15} strokeWidth={2} /></button>
          </span>
        )}
      </div>
    </div>
  )
}
