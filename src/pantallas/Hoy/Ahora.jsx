import { useMemo } from 'react'
import { ArrowRight, Clock } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Chip from '../../componentes/Chip.jsx'
import Marca from '../../componentes/Marca.jsx'
import { nombreFase, colorBloque, minutosRestantes, textoMinutos, siguienteBloque } from '../../datos/bloques.js'

/**
 * La tarjeta AHORA (LOGICA §10.0-7): el bloque actual del raíl, sus horas, lo que queda
 * (avanza con `ahora`, cada 30 s), la fase, el siguiente bloque, y dentro las tareas de
 * Hoy cuya hora cae en él (marcar hecha con un toque). Sustituye a «la primera de Hoy»
 * cuando hay protocolo; sin bloque actual, la pantalla cae a la tarjeta de antes.
 */
export default function Ahora({ bloque, bloques, fecha, ahora, tareas, alAbrir, alCompletar }) {
  const restan = useMemo(() => minutosRestantes(bloque, ahora), [bloque, ahora])
  const siguiente = useMemo(() => siguienteBloque(bloques, fecha, ahora), [bloques, fecha, ahora])
  if (!bloque) return null
  const color = colorBloque(bloque)

  return (
    <Tarjeta variante="calida" className="ahora" style={{ '--bloque-color': color }} aria-label={`Ahora: ${bloque.nombre}`}>
      <div className="ahora-cabeza">
        <div style={{ minWidth: 0 }}>
          <div className="ahora-etiqueta">
            <span className="ahora-punto" aria-hidden="true" />
            Ahora
            <Chip pequeno color={color} punto={false} className="ahora-fase">{nombreFase(bloque.fase)}</Chip>
          </div>
          <div className="ahora-titulo">{bloque.icono && <span className="ahora-icono" aria-hidden="true">{bloque.icono}</span>}{bloque.nombre}</div>
        </div>
        <span className="ahora-restan"><Clock size={14} strokeWidth={2} />{restan > 0 ? `${textoMinutos(restan)}` : 'acaba'}</span>
      </div>

      <div className="ahora-horas">
        <span>{bloque.inicio} – {bloque.fin}</span>
        {restan > 0 && <span className="t-terciario">quedan {textoMinutos(restan)}</span>}
      </div>

      {tareas.length > 0 && (
        <ul className="ahora-tareas">
          {tareas.map((t) => (
            <li key={t.id} className={`ahora-tarea${t.hecha ? ' ahora-tarea--hecha' : ''}`} onClick={() => alAbrir(t)}>
              <Marca hecha={!!t.hecha} alCambiar={(hecha) => alCompletar(t, hecha)} aria-label={`Completar ${t.titulo}`} />
              <span className="ahora-tarea-titulo">{t.titulo}</span>
              {t.horaInicio && <span className="ahora-tarea-hora">{t.horaInicio}</span>}
            </li>
          ))}
        </ul>
      )}

      {siguiente && (
        <div className="ahora-siguiente">
          <ArrowRight size={14} strokeWidth={2} />
          <span className="ahora-siguiente-texto">
            siguiente: <strong>{siguiente.bloque.nombre}</strong> · {siguiente.bloque.inicio}{siguiente.fecha !== fecha ? ' (mañana)' : ''}
          </span>
        </div>
      )}
    </Tarjeta>
  )
}
