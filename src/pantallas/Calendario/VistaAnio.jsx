import { useMemo } from 'react'
import { Flag } from 'lucide-react'
import { hayPendientes, hitosPorDia, indicePorDia } from './calendario.js'
import { deISO, mesDe, nombreMes, textoFecha } from '../../datos/fechas.js'
import { textoHito, urgente } from '../../datos/hitos.js'

const CABECERA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const dos = (n) => String(n).padStart(2, '0')

/**
 * Año (LOGICA §5.2): los doce meses en miniatura. Hoy en naranja, punto bajo los días con
 * tareas, y los días con hito en ámbar con su bandera. Debajo, los hitos del año en orden.
 * Toque en un día (o en un hito) → ese día en la vista Mes.
 */
export default function VistaAnio({ tareas, hitos, anio, hoy, fecha, alElegir }) {
  const meses = useMemo(() => Array.from({ length: 12 }, (_, i) => mesDe(`${anio}-${dos(i + 1)}-01`)), [anio])
  const desde = `${anio}-01-01`
  const hasta = `${anio}-12-31`
  const indice = useMemo(() => indicePorDia(tareas, desde, hasta), [tareas, desde, hasta])
  const hitosDia = useMemo(() => hitosPorDia(hitos, desde, hasta), [hitos, desde, hasta])
  const hitosAnio = useMemo(() => [...hitosDia.values()].flat().sort((a, b) => a.fecha.localeCompare(b.fecha)), [hitosDia])

  return (
    <>
      <div className="anio-rejilla">
        {meses.map((m) => (
          <section key={m.primero} className={`anio-mes${hoy.slice(0, 7) === m.primero.slice(0, 7) ? ' anio-mes--actual' : ''}`}>
            <button type="button" className="anio-mes-titulo" onClick={() => alElegir(fecha.slice(0, 7) === m.primero.slice(0, 7) ? fecha : m.primero)}>
              {nombreMes(m.primero).charAt(0).toUpperCase() + nombreMes(m.primero).slice(1)}
            </button>
            <div className="anio-semana anio-semana--cabecera">
              {CABECERA.map((d, i) => <span key={i}>{d}</span>)}
            </div>
            {m.semanas.map((semana) => (
              <div key={semana[0]} className="anio-semana">
                {semana.map((iso) => {
                  if (iso < m.primero || iso > m.ultimo) return <span key={iso} />
                  const dia = indice.get(iso)
                  const hs = hitosDia.get(iso)
                  const conTareas = dia && (dia.vencen.length > 0 || dia.periodo.length > 0)
                  return (
                    <button
                      key={iso}
                      type="button"
                      className={[
                        'anio-dia',
                        iso === hoy && 'anio-dia--hoy',
                        hs && 'anio-dia--hito',
                        hs && hs.every((h) => h.hecho) && 'anio-dia--hito-hecho',
                      ].filter(Boolean).join(' ')}
                      onClick={() => alElegir(iso)}
                      title={hs ? hs.map((h) => (h.frente ? `${h.frente}: ${h.nombre}` : h.nombre)).join('\n') : undefined}
                      aria-label={`${textoFecha(iso, true)}${hs ? `, ${hs.length} hito${hs.length > 1 ? 's' : ''}` : ''}${conTareas ? ', con tareas' : ''}`}
                    >
                      {deISO(iso).getDate()}
                      {conTareas && <span className={`anio-dia-punto${hayPendientes(dia) ? '' : ' anio-dia-punto--hecha'}`} />}
                    </button>
                  )
                })}
              </div>
            ))}
          </section>
        ))}
      </div>

      <section className="cal-lista">
        <div className="cal-lista-cabecera">
          <div>
            <span className="cal-lista-titulo">Hitos de {anio}</span>
            <span className="cal-lista-cuenta"> · {hitosAnio.length === 0 ? 'ninguno con fecha' : hitosAnio.length === 1 ? '1 hito' : `${hitosAnio.length} hitos`}</span>
          </div>
        </div>
        {hitosAnio.length > 0 && (
          <div className="anio-hitos">
            {hitosAnio.map((h) => (
              <button
                key={h.id}
                type="button"
                className={`anio-hito${h.hecho ? ' anio-hito--hecho' : ''}${urgente(h, hoy) ? ' anio-hito--urgente' : ''}`}
                onClick={() => alElegir(h.fecha)}
              >
                <span className="anio-hito-fecha">{textoFecha(h.fecha)}</span>
                <Flag size={14} strokeWidth={1.75} className="anio-hito-icono" />
                <span className="anio-hito-textos">
                  <span className="anio-hito-nombre">{h.frente || h.nombre}</span>
                  {h.frente && <span className="anio-hito-detalle">{h.nombre}</span>}
                </span>
                <span className="anio-hito-cuando">{h.hecho ? 'hecho' : textoHito(h, hoy)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
