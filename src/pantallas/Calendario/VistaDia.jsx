import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Plus } from 'lucide-react'
import Boton from '../../componentes/Boton.jsx'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import EstadoCarga from './EstadoCarga.jsx'
import FilaTarea from './FilaTarea.jsx'
import Fantasma from './Fantasma.jsx'
import SelectorDuracion from './SelectorDuracion.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import { usarAhora, usarGuardarTarea, usarPulsacion } from './ganchos.js'
import { usarArrastreHora } from './arrastreHora.js'
import { HORAS, PX_HORA, altoDeDuracion, alturaDe, colocarEnTimeline, enCurso, tareasDelDia } from './calendario.js'
import { aMinutos, deMinutos } from '../../datos/fechas.js'

const ALTO_SELECTOR = 78   // lo que ocupa «¿Cuánto?» (para decidir si va debajo o encima)
const ALTO_NAV = 64 + 24

/**
 * Día: el «Ongoing» del mockup. Arriba «Todo el día» (las que vencen sin hora y las que
 * atraviesan el día); debajo el timeline de 6:00 a 24:00 con las horas a la izquierda y
 * las tarjetas colocadas por hora (altura proporcional; sin hora de fin, una hora).
 * La que está en curso ahora va en NARANJA, el resto en CÁLIDA; la línea naranja con punto
 * marca «ahora» y se mueve cada minuto. Pulsación larga en el hueco → nueva tarea del día.
 *
 * El día se organiza arrastrando (LOGICA §5.1): una fila de «Todo el día» o una tarjeta del
 * timeline se levanta y se suelta a la hora exacta; sin duración, sale «¿Cuánto?».
 */
export default function VistaDia({ tareas, fecha, hoy, estado = null, alNueva }) {
  const { abrirTarea, nombreProyecto } = useDatos()
  const { programar } = usarGuardarTarea()
  const ahora = usarAhora()
  const dia = useMemo(() => tareasDelDia(tareas, fecha), [tareas, fecha])
  const colocadas = useMemo(() => colocarEnTimeline(dia.vencen), [dia])
  const todoElDia = dia.vencen.filter((t) => !t.horaInicio)
  const esHoy = fecha === hoy
  const minutosAhora = aMinutos(ahora)
  const lineaAhora = esHoy && minutosAhora >= HORAS[0] * 60 && minutosAhora < (HORAS[HORAS.length - 1] + 1) * 60
  const refAhora = useRef(null)
  const pistaRef = useRef(null)
  const listaRef = useRef(null)

  // Al abrir el día de hoy, el timeline se centra en «ahora»: lo que importa es lo que viene
  useEffect(() => {
    if (lineaAhora && refAhora.current) refAhora.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [fecha, esHoy]) // sólo al cambiar de día, no cada minuto

  const hueco = usarPulsacion({ alLargo: () => alNueva(fecha), soloPropio: true })

  /* ── arrastrar para poner hora ────────────────────────────────────────── */
  // «¿Cuánto?» abierto: { tareaId, minutos, arriba }. Guarda el id, no la tarea: al elegir se
  // lee la tarea ACTUAL de la vista (ya con la hora de inicio escrita por la primera escritura).
  const [pidiendo, setPidiendo] = useState(null)
  const cerrarPidiendo = useCallback(() => setPidiendo(null), [])
  useEffect(() => setPidiendo(null), [fecha])

  const alSoltar = useCallback((t, { minutos, duracion }) => {
    setPidiendo(null)
    if (minutos == null) {
      if (t.horaInicio || t.horaFin) programar(t, null, null)
      return
    }
    const inicio = deMinutos(minutos)
    const mismoInicio = t.horaInicio && aMinutos(t.horaInicio) === minutos
    if (duracion) {
      if (!mismoInicio) programar(t, inicio, deMinutos(minutos + duracion))
      return
    }
    // sin duración: primero aterriza (hora de inicio, fin fuera), luego se pregunta cuánto
    if (!mismoInicio) programar(t, inicio, null)
    const pista = pistaRef.current?.getBoundingClientRect()
    const debajo = alturaDe(minutos) + altoDeDuracion(null) + 6
    const cabeDebajo = !pista || pista.top + debajo + ALTO_SELECTOR < window.innerHeight - ALTO_NAV
    setPidiendo({ tareaId: t.id, minutos, arriba: !cabeDebajo })
  }, [programar])

  const elegirDuracion = (d) => {
    const t = tareas.find((x) => x.id === pidiendo.tareaId)
    setPidiendo(null)
    if (!t) return
    programar(t, deMinutos(pidiendo.minutos), deMinutos(pidiendo.minutos + d))
  }

  const { vuelo, fantasmaRef, props: arrastre } = usarArrastreHora({ pistaRef, listaRef, alSoltar })
  const enVueloId = vuelo?.tarea.id || null
  const sobreLista = vuelo?.sobre === 'lista'
  const iman = vuelo?.sobre === 'pista' && vuelo.minutos != null ? vuelo.minutos : null

  return (
    <>
      <section className={`cal-todo-el-dia${sobreLista ? ' cal-todo-el-dia--destino' : ''}`} ref={listaRef}>
        <div className="cal-lista-cabecera">
          <div>
            <span className="cal-lista-titulo">Todo el día</span>
            {!estado && todoElDia.length + dia.periodo.length === 0 && !sobreLista && <span className="cal-lista-cuenta"> · nada</span>}
            {sobreLista && <span className="cal-lista-cuenta cal-lista-cuenta--destino"> · suelta para quitar la hora</span>}
          </div>
          <Boton variante="fantasma" pequeno icono={<Plus size={18} strokeWidth={1.75} />} aria-label="Nueva tarea para este día" onClick={() => alNueva(fecha)} />
        </div>
        {/* sin tareas en memoria el timeline vacío no es «un día libre»: se dice qué pasa */}
        {estado && <EstadoCarga estado={estado} />}
        {!estado && (todoElDia.length > 0 || dia.periodo.length > 0) && (
          <div className="cal-lista-filas">
            {todoElDia.map((t) => (
              <FilaTarea key={t.id} tarea={t} arrastre={arrastre(t, { desde: 'lista' })} enVuelo={t.id === enVueloId} />
            ))}
            {dia.periodo.map((t) => <FilaTarea key={`p-${t.id}`} tarea={t} fina />)}
          </div>
        )}
      </section>

      <div className="cal-timeline" style={{ height: HORAS.length * PX_HORA }}>
        <div className="cal-horas" aria-hidden="true">
          {HORAS.map((h) => (
            <span key={h} className="cal-hora" style={{ top: (h - HORAS[0]) * PX_HORA }}>{String(h).padStart(2, '0')}:00</span>
          ))}
          {/* la hora exacta a la que va a caer, tapando la etiqueta que hubiera debajo */}
          {iman != null && <span className="cal-hora cal-hora--iman" style={{ top: alturaDe(iman) }}>{deMinutos(iman)}</span>}
        </div>

        <div className="cal-pista-horas" ref={pistaRef} {...hueco}>
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
                className={`cal-evento ${t.hecha ? 'cal-evento--hecha' : ''} ${corta ? 'cal-evento--corta' : ''} ${t.id === enVueloId ? 'cal-evento--en-vuelo' : ''}`}
                // 8px de aire tras la línea de la izquierda; 3px entre columnas cuando se solapan
                style={{ top, height: alto, left: `calc(${columna * ancho}% + 8px)`, width: `calc(${ancho}% - ${8 + (columnas > 1 ? 3 : 0)}px)` }}
                onClick={() => abrirTarea(t.id)}
                aria-label={`${t.titulo}, ${t.horaInicio}${t.horaFin ? ` a ${t.horaFin}` : ''}`}
                {...arrastre(t, { desde: 'pista' })}
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

          {/* la línea imán: dónde va a empezar lo que está en el aire */}
          {iman != null && <div className="cal-iman" style={{ top: alturaDe(iman) }} aria-hidden="true" />}

          {lineaAhora && (
            <div className="cal-ahora" style={{ top: alturaDe(minutosAhora) }} ref={refAhora} aria-label={`Ahora, ${ahora}`}>
              <span className="cal-ahora-punto" />
            </div>
          )}

          <AnimatePresence>
            {pidiendo && (
              <SelectorDuracion
                key={pidiendo.tareaId}
                top={pidiendo.arriba ? alturaDe(pidiendo.minutos) - 6 : alturaDe(pidiendo.minutos) + altoDeDuracion(null) + 6}
                arriba={pidiendo.arriba}
                alElegir={elegirDuracion}
                alCerrar={cerrarPidiendo}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      <Fantasma ref={fantasmaRef} vuelo={vuelo} proyecto={vuelo ? nombreProyecto(vuelo.tarea) : ''} />
    </>
  )
}
