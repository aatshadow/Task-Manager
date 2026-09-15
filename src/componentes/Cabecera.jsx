import { ChevronLeft } from 'lucide-react'
import Boton from './Boton.jsx'

// Título grande + subtítulo + avatar redondo a la derecha (abre Ajustes). Con `alAtras`
// aparece una flecha a la izquierda y desaparece el avatar: es la cabecera de Ajustes.
export default function Cabecera({ titulo, subtitulo, inicial = 'A', alAvatar, alAtras, accion }) {
  return (
    <header className="cabecera">
      {alAtras && <Boton variante="fantasma" icono={<ChevronLeft size={24} strokeWidth={1.75} />} aria-label="Volver" onClick={alAtras} />}
      <div className="cabecera-textos">
        <h1 className="cabecera-titulo">{titulo}</h1>
        {subtitulo && <p className="cabecera-subtitulo">{subtitulo}</p>}
      </div>
      {accion}
      {!alAtras && (
        <button className="cabecera-avatar" onClick={alAvatar} aria-label="Ajustes">
          {inicial}
        </button>
      )}
    </header>
  )
}
