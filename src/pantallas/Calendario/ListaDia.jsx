import { CalendarDays, Plus } from 'lucide-react'
import Boton from '../../componentes/Boton.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import EstadoCarga from './EstadoCarga.jsx'
import FilaTarea from './FilaTarea.jsx'
import { nombreDia, textoFecha } from '../../datos/fechas.js'

/**
 * La lista de un día, debajo de la rejilla del mes o de la tira de la semana:
 * cabecera «Martes 16 · 3 tareas» con el «+» del día, las que vencen y, en fino, las que
 * sólo lo atraviesan. Las props de mover (`levantadaId`, `alLevantar`, `alSoltar`) sólo
 * las pasa la semana. `estado` ('cargando' | 'error' | null) manda sobre el vacío.
 */
export default function ListaDia({ fecha, dia, hoy, estado = null, alNueva, levantadaId = null, alLevantar, alSoltar }) {
  const n = dia.vencen.length
  const nombre = nombreDia(fecha)
  const titulo = fecha === hoy ? 'Hoy' : `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${textoFecha(fecha).split(' ')[0]}`
  const cuenta = estado ? null : n === 0 ? 'sin tareas' : n === 1 ? '1 tarea' : `${n} tareas`

  return (
    <section className="cal-lista">
      <div className="cal-lista-cabecera">
        <div>
          <span className="cal-lista-titulo">{titulo}</span>
          {cuenta && <span className="cal-lista-cuenta"> · {cuenta}</span>}
        </div>
        <Boton variante="fantasma" pequeno icono={<Plus size={18} strokeWidth={1.75} />} aria-label={`Nueva tarea para el ${textoFecha(fecha)}`} onClick={alNueva} />
      </div>

      {estado ? (
        <EstadoCarga estado={estado} />
      ) : n === 0 && dia.periodo.length === 0 ? (
        <Vacio icono={CalendarDays} titulo="Nada para este día" texto="Toca + o mantén pulsado el día para añadir una." />
      ) : (
        <div className="cal-lista-filas">
          {dia.vencen.map((t) => (
            <FilaTarea
              key={t.id}
              tarea={t}
              levantada={t.id === levantadaId}
              alLevantar={alLevantar}
              alSoltar={alSoltar}
            />
          ))}
          {dia.periodo.map((t) => <FilaTarea key={`p-${t.id}`} tarea={t} fina />)}
        </div>
      )}
    </section>
  )
}
