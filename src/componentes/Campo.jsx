import { useId } from 'react'

// Input o textarea con etiqueta encima y ayuda/error debajo. Controlado con
// `valor` + `alCambiar(valorNuevo)`; el resto de props van al input tal cual
// (type, placeholder, autoFocus, autoComplete, inputMode…).
export default function Campo({
  etiqueta,
  valor,
  alCambiar,
  multilinea = false,
  icono,
  ayuda,
  error,
  className = '',
  id,
  ...resto
}) {
  const idAuto = useId()
  const idCampo = id || idAuto
  const Elemento = multilinea ? 'textarea' : 'input'
  const clases = ['campo', error && 'campo--error', className].filter(Boolean).join(' ')
  return (
    <div className={clases}>
      {etiqueta && <label className="campo-etiqueta" htmlFor={idCampo}>{etiqueta}</label>}
      <div className={`campo-caja ${icono ? 'campo-caja--con-icono' : ''}`}>
        <Elemento
          id={idCampo}
          value={valor ?? ''}
          onChange={alCambiar ? e => alCambiar(e.target.value) : undefined}
          aria-invalid={error ? true : undefined}
          {...resto}
        />
        {icono && <span className="campo-icono">{icono}</span>}
      </div>
      {(error || ayuda) && <div className="campo-ayuda">{error || ayuda}</div>}
    </div>
  )
}
