import { useMemo } from 'react'
import { ListPlus, Plus } from 'lucide-react'
import Hoja from '../../componentes/Hoja.jsx'
import Chip from '../../componentes/Chip.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import { esAtrasada, esViva } from '../../datos/tareas.js'
import { textoFecha } from '../../datos/fechas.js'

/**
 * La hoja de «Planificar»: lo que hay en Siguiente (vivo, no hecho, sin día) para meter
 * en Hoy de un toque. La tarea desaparece de aquí en cuanto entra en Hoy, así que la
 * lista es siempre «lo que aún no has traído». Las atrasadas suben arriba: son las que
 * más falta hace planificar.
 */
export default function HojaPlanificar({ abierta, alCerrar, alPlanificar }) {
  const { tareas, hoy, nombreProyecto, colorProyecto, cuadrantes } = useDatos()

  const siguiente = useMemo(() => {
    const lista = (tareas || []).filter((t) => esViva(t) && !t.hoyPara)
    return lista.sort((a, b) => {
      const atA = esAtrasada(a, hoy) ? 0 : 1
      const atB = esAtrasada(b, hoy) ? 0 : 1
      if (atA !== atB) return atA - atB
      if ((a.vence || '') !== (b.vence || '')) return (a.vence || '9999') < (b.vence || '9999') ? -1 : 1
      return (a.creadaEn || '') < (b.creadaEn || '') ? -1 : 1
    })
  }, [tareas, hoy])

  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo="Planificar">
      {siguiente.length === 0 ? (
        <Vacio icono={ListPlus} titulo="Nada en Siguiente" texto="Todo lo vivo ya está en Hoy o hecho." />
      ) : (
        <div className="hoy-planificar">
          <p className="hoy-planificar-ayuda">Toca una tarea para traerla a hoy.</p>
          {siguiente.map((t) => {
            const proyecto = nombreProyecto(t)
            const q = t.cuadrante ? cuadrantes[t.cuadrante] : null
            const atrasada = esAtrasada(t, hoy)
            return (
              <button key={`${t.origen}:${t.id}`} type="button" className="hoy-planificar-fila" onClick={() => alPlanificar(t)}>
                <span className="hoy-planificar-mas"><Plus size={20} strokeWidth={1.75} /></span>
                <span className="hoy-fila-cuerpo">
                  <span className="hoy-fila-titulo">{t.titulo}</span>
                  {(proyecto || q) && (
                    <span className="hoy-fila-chips">
                      {proyecto && <Chip pequeno color={colorProyecto(t)}>{proyecto}</Chip>}
                      {q && <Chip pequeno color={q.color}>{q.nombre}</Chip>}
                    </span>
                  )}
                </span>
                {t.vence && (
                  <span className={`hoy-planificar-vence${atrasada ? ' hoy-planificar-vence--atrasada' : ''}`}>
                    {textoFecha(t.vence)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </Hoja>
  )
}
