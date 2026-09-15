import { useEffect, useMemo, useRef } from 'react'
import { Plus } from 'lucide-react'
import Boton from '../../componentes/Boton.jsx'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import EstadoCarga from './EstadoCarga.jsx'
import FilaTarea from './FilaTarea.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import { usarAhora, usarPulsacion } from './ganchos.js'
import { HORAS, PX_HORA, alturaDe, colocarEnTimeline, enCurso, tareasDelDia } from './calendario.js'
import { aMinutos } from '../../datos/fechas.js'

/**
 * Día: el «Ongoing» del mockup. Arriba «Todo el día» (las que vencen sin hora y las que
 * atraviesan el día); debajo el timeline de 6:00 a 23:00 con las horas a la izquierda y
 * las tarjetas colocadas por hora (altura proporcional; sin hora de fin, una hora).
 * La que está en curso ahora va en NARANJA, el resto en CÁLIDA; la línea naranja con punto
 * marca «ahora» y se mueve cada minuto. Pulsación larga en el hueco → nueva tarea del día.
 */
export default function VistaDia({ tareas, fecha, hoy, estado = null, alNueva }) {
  const { abrirTarea, nombreProyecto } = useDatos()
  const ahora = usarAhora()
  const dia = useMemo(() => tareasDelDia(tareas, fecha), [tareas, fecha])
  const colocadas = useMemo(() => colocarEnTimeline(dia.vencen), [dia])
  const todoElDia = dia.vencen.filter((t) => !t.horaInicio)
  const esHoy = fecha === hoy
  const minutosAhora = aMinutos(ahora)
  const lineaAhora = esHoy && minutosAhora >= HORAS[0] * 60 && minutosAhora < (HORAS[HORAS.length - 1] + 1) * 60
  const refAhora = useRef(null)

  // Al abrir el día de hoy, el timeline se centra en «ahora»: lo que importa es lo que viene
  useEffect(() => {
    if (lineaAhora && refAhora.current) refAhora.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [fecha, esHoy]) // sólo al cambiar de día, no cada minuto

  const hueco = usarPulsacion({ alLargo: () => alNueva(fecha), soloPropio: true })

  return (
    <>
      <section className="cal-todo-el-dia">
        <div className="cal-lista-cabecera">
          <div>
            <span className="cal-lista-titulo">Todo el día</span>
            {!estado && todoElDia.length + dia.periodo.length === 0 && <span className="cal-lista-cuenta"> · nada</span>}
          </div>
          <Boton variante="fantasma" pequeno icono={<Plus size={18} strokeWidth={1.75} />} aria-label="Nueva tarea para este día" onClick={() => alNueva(fecha)} />
        </div>
        {/* sin tareas en memoria el timeline vacío no es «un día libre»: se dice qué pasa */}
        {estado && <EstadoCarga estado={estado} />}
        {!estado && (todoElDia.length > 0 || dia.periodo.length > 0) && (
          <div className="cal-lista-filas">
            {todoElDia.map((t) => <FilaTarea key={t.id} tarea={t} />)}
            {dia.periodo.map((t) => <FilaTarea key={`p-${t.id}`} tarea={t} fina />)}
          </div>
        )}
      </section>

      <div className="cal-timeline" style={{ height: HORAS.length * PX_HORA }}>
        <div className="cal-horas" aria-hidden="true">
          {HORAS.map((h) => (
            <span key={h} className="cal-hora" style={{ top: (h - HORAS[0]) * PX_HORA }}>{String(h).padStart(2, '0')}:00</span>
          ))}
        </div>

        <div className="cal-pista-horas" {...hueco}>
          {HORAS.map((h) => <span key={h} className="cal-linea-hora" style={{ top: (h - HORAS[0]) * PX_HORA }} aria-hidden="true" />)}

          {colocadas.map(({ tarea: t, top, alto, columna, columnas, inicio, fin }) => {
            const activa = esHoy && !t.hecha && enCurso({ inicio, fin }, minutosAhora)
            const ancho = 100 / columnas
            const corta = alto < 48
            return (
              <Tarjeta
                key={t.id}
                variante={t.hecha ? 'normal' : activa ? 'naranja' : 'calida'}
                compacta
                className={`cal-evento ${t.hecha ? 'cal-evento--hecha' : ''} ${corta ? 'cal-evento--corta' : ''}`}
                // 8px de aire tras la línea de la izquierda; 3px entre columnas cuando se solapan
                style={{ top, height: alto, left: `calc(${columna * ancho}% + 8px)`, width: `calc(${ancho}% - ${8 + (columnas > 1 ? 3 : 0)}px)` }}
                onClick={() => abrirTarea(t.id)}
                aria-label={`${t.titulo}, ${t.horaInicio}${t.horaFin ? ` a ${t.horaFin}` : ''}`}
              >
                <div className="cal-evento-titulo">{t.titulo}</div>
                {!corta && (
                  <div className="cal-evento-meta t-secundario">
                    {t.horaInicio}{t.horaFin ? ` – ${t.horaFin}` : ''}
                    {nombreProyecto(t) ? ` · ${nombreProyecto(t)}` : ''}
                  </div>
                )}
              </Tarjeta>
            )
          })}

          {lineaAhora && (
            <div className="cal-ahora" style={{ top: alturaDe(minutosAhora) }} ref={refAhora} aria-label={`Ahora, ${ahora}`}>
              <span className="cal-ahora-punto" />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
