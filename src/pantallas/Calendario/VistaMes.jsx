import { useMemo } from 'react'
import CeldaDia from './CeldaDia.jsx'
import ListaDia from './ListaDia.jsx'
import { indicePorDia } from './calendario.js'
import { mesDe } from '../../datos/fechas.js'

const CABECERA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/**
 * Mes: rejilla de lunes a domingo (España), hoy en círculo naranja, punto bajo los días
 * con tareas; toque en un día → su lista debajo. Los días de relleno del mes vecino se
 * pintan apagados pero se pueden tocar: es lo que uno espera al ver el 1 en la fila del 28.
 */
export default function VistaMes({ tareas, mes, fecha, hoy, estado = null, alElegir, alNueva }) {
  const m = useMemo(() => mesDe(mes), [mes])
  const desde = m.semanas[0][0]
  const hasta = m.semanas[m.semanas.length - 1][6]
  const indice = useMemo(() => indicePorDia(tareas, desde, hasta), [tareas, desde, hasta])
  const diaElegido = indice.get(fecha) || { vencen: [], periodo: [] }

  return (
    <>
      <div className="cal-rejilla" role="grid" aria-label="Días del mes">
        <div className="cal-rejilla-cabecera" role="row">
          {CABECERA.map((d, i) => <span key={i} role="columnheader">{d}</span>)}
        </div>
        {m.semanas.map((semana) => (
          <div className="cal-rejilla-fila" role="row" key={semana[0]}>
            {semana.map((iso) => (
              <CeldaDia
                key={iso}
                fecha={iso}
                hoy={hoy}
                seleccionada={iso === fecha}
                apagada={iso < m.primero || iso > m.ultimo}
                dia={indice.get(iso)}
                alElegir={alElegir}
                alNueva={alNueva}
              />
            ))}
          </div>
        ))}
      </div>

      <ListaDia fecha={fecha} dia={diaElegido} hoy={hoy} estado={estado} alNueva={() => alNueva(fecha)} />
    </>
  )
}
