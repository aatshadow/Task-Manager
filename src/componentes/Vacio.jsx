import { Inbox } from 'lucide-react'

// Estado vacío: icono en círculo, un título y una frase corta. `accion` es un botón opcional.
// `icono` recibe un componente de lucide (no un elemento) para aplicar el trazo de la casa.
export default function Vacio({ icono: Icono = Inbox, titulo, texto, accion }) {
  return (
    <div className="vacio">
      <div className="vacio-icono"><Icono size={24} strokeWidth={1.75} /></div>
      {titulo && <div className="vacio-titulo">{titulo}</div>}
      {texto && <div className="vacio-texto">{texto}</div>}
      {accion && <div className="vacio-accion">{accion}</div>}
    </div>
  )
}
