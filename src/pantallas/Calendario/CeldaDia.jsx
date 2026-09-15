import { useDatos } from '../../estado/useDatos.jsx'
import { usarPulsacion } from './ganchos.js'
import { esPeriodo, hayPendientes } from './calendario.js'
import { deISO, textoFecha } from '../../datos/fechas.js'

const VACIO = { vencen: [], periodo: [] }

/**
 * Una celda de día, la misma en la rejilla del mes y en la tira de la semana: número en
 * círculo (naranja relleno si es hoy, aro si está elegido), punto si hay tareas y barras
 * finas por cada período que pasa por el día. Toque elige el día; pulsación larga crea una
 * tarea que vence ese día. `data-dia` es lo que busca el arrastre de la semana al soltar.
 */
export default function CeldaDia({ fecha, hoy, seleccionada = false, apagada = false, dia = VACIO, etiqueta, alElegir, alNueva, destino = false }) {
  const { colorProyecto } = useDatos()
  const pulsacion = usarPulsacion({ alToque: () => alElegir(fecha), alLargo: () => alNueva(fecha) })

  const esHoy = fecha === hoy
  const hayAlgo = dia.vencen.length > 0 || dia.periodo.length > 0
  // en las barras entra también la que vence hoy si es un período: su último día también cuenta
  const periodos = [...dia.periodo, ...dia.vencen.filter(esPeriodo)].slice(0, 2)

  const clases = [
    'cal-celda',
    esHoy && 'cal-celda--hoy',
    seleccionada && 'cal-celda--elegida',
    apagada && 'cal-celda--apagada',
    destino && 'cal-celda--destino',
  ].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      className={clases}
      data-dia={fecha}
      aria-label={`${textoFecha(fecha, true)}${hayAlgo ? `, ${dia.vencen.length} tareas` : ''}`}
      aria-pressed={seleccionada}
      {...pulsacion}
    >
      {etiqueta && <span className="cal-celda-etiqueta">{etiqueta}</span>}
      <span className="cal-celda-numero">{deISO(fecha).getDate()}</span>
      <span className={`cal-celda-punto ${hayAlgo ? (hayPendientes(dia) ? 'cal-celda-punto--viva' : 'cal-celda-punto--hecha') : ''}`} aria-hidden="true" />
      <span className="cal-celda-barras" aria-hidden="true">
        {periodos.map((t) => (
          <span
            key={t.id}
            className={[
              'cal-celda-barra',
              t.inicio === fecha && 'cal-celda-barra--empieza',
              t.vence === fecha && 'cal-celda-barra--acaba',
            ].filter(Boolean).join(' ')}
            style={{ background: colorProyecto(t) || 'var(--texto-3)' }}
          />
        ))}
      </span>
    </button>
  )
}
