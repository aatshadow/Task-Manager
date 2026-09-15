import Tarjeta from './Tarjeta.jsx'

// Un número de 34–38px con su etiqueta debajo, dentro de una tarjeta. Los cuatro de Hoy
// (Hechas · En Hoy · Atrasadas · Bandeja) son esto; `variante` deja pintar uno en naranja.
export default function NumeroGrande({ valor, etiqueta, sufijo, icono, variante = 'normal', onClick, className = '' }) {
  return (
    <Tarjeta variante={variante} onClick={onClick} className={`numero ${className}`}>
      {icono && <div className="numero-cabeza">{icono}</div>}
      <div>
        <div className="numero-valor">
          {valor}
          {sufijo && <span className="numero-sufijo">{sufijo}</span>}
        </div>
        {etiqueta && <div className="numero-etiqueta">{etiqueta}</div>}
      </div>
    </Tarjeta>
  )
}
