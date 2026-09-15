/**
 * Estadisticas — la pantalla Stats (LOGICA.md §5, decisión 7).
 * Un selector 7 · 30 · 90 arriba que manda sobre todo lo de abajo: creadas vs hechas por
 * día, los cuatro números, hechas por proyecto/categoría/cuadrante, la sobrecarga de
 * `hoy_dias` y el cumplimiento de hábitos de las últimas 8 semanas (este último no
 * depende del rango: ocho semanas son ocho semanas).
 *
 * Las tareas NO salen del contexto: `tareas` viene sin archivadas, y archivar una tarea
 * hecha es lo normal (§4). Si Stats contara solo las vivas, la cifra histórica cambiaría
 * según se limpie o no. Por eso carga su propia base con `cargarTodas({ incluirArchivadas })`
 * y la relee cada vez que el contexto recarga (así lo hecho hace un minuto también cuenta).
 * Hábitos y marcas sí vienen del contexto: un hábito no se borra, se archiva, y sigue ahí.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, CloudOff, RefreshCw } from 'lucide-react'
import { useDatos } from '../../estado/useDatos.jsx'
import { cargarDias, cargarTodas } from '../../datos/tareas.js'
import {
  hechasEnRango, seriesCreadasHechas, porProyecto, porCategoria, porCuadrante, rachaDias,
} from '../../datos/estadisticas.js'
import Segmentos from '../../componentes/Segmentos.jsx'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import NumeroGrande from '../../componentes/NumeroGrande.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import Boton from '../../componentes/Boton.jsx'
import { GraficoLineas, BarrasHorizontales, BarrasDobles, ColumnasSemanas } from './graficos.jsx'
import {
  RANGOS, rangoDe, diaEnCurso, totalSobrecarga, sobrecargaSinHuecos, sobrecargaPorSemana, cumplimientoPorSemana, plegarOtros, num,
} from './calculos.js'
import './estadisticas.css'

// la misma referencia mientras no hay base: así los useMemo no recalculan en cada render
const SIN_TAREAS = []

export default function Estadisticas() {
  const {
    tareas, habitos, marcas, hoy, proyectosTodos, clientes, categoriasTodas, cuadrantes,
    colorCategoria, avisar, cargando, error, recargar,
  } = useDatos()
  const [n, setN] = useState(30)
  // la base histórica (con archivadas); null = aún no leída
  const [base, setBase] = useState(null)
  const hayBaseRef = useRef(false) // para que el efecto de relectura no dependa de `base`
  hayBaseRef.current = base != null
  const [errorBase, setErrorBase] = useState(null)
  const [intentoBase, setIntentoBase] = useState(0)
  // los días cerrados de `hoy_dias`; null = aún no leídos
  const [dias, setDias] = useState(null)
  const [errorDias, setErrorDias] = useState(null)
  const [intentoDias, setIntentoDias] = useState(0)

  const { desde, hasta, desdeCarga } = useMemo(() => rangoDe(hoy, n), [hoy, n])

  // La base se relee cada vez que el contexto trae tareas nuevas (cada `recargar()`):
  // una tarea completada o archivada hace un momento tiene que contar ya. Mientras el
  // arranque del contexto está en marcha no tiene sentido pedir nada.
  useEffect(() => {
    if (cargando) return undefined
    let vivo = true
    cargarTodas({ incluirArchivadas: true })
      .then((t) => { if (vivo) { setBase(t); setErrorBase(null) } })
      .catch((e) => {
        if (!vivo) return
        // sin base previa la tarjeta ya enseña el fallo; con base, la que se ve es la vieja y hay que decirlo
        if (hayBaseRef.current) avisar?.(e.message || 'No se pudieron releer las tareas', 'error')
        else setErrorBase(e)
      })
    return () => { vivo = false }
  }, [tareas, cargando, intentoBase, avisar])

  // `hoy_dias` solo cambia al reiniciar el día, así que basta recargarla cuando cambia el rango
  // (y `hasta` = hoy cambia solo al reiniciar). Un fallo aquí NO es «sin días»: se guarda aparte.
  useEffect(() => {
    let vivo = true
    setErrorDias(null)
    cargarDias(desdeCarga, hasta)
      .then((d) => { if (vivo) setDias(d) })
      .catch((e) => { if (vivo) { setDias(null); setErrorDias(e) } })
    return () => { vivo = false }
  }, [desdeCarga, hasta, intentoDias])

  const cargandoBase = base == null && !errorBase
  const cargandoDias = dias == null && !errorDias
  const tareasBase = base || SIN_TAREAS

  /* ── derivados del rango ───────────────────────────────────────────────── */
  const series = useMemo(() => seriesCreadasHechas(tareasBase, desde, hasta), [tareasBase, desde, hasta])
  const hechas = useMemo(() => hechasEnRango(tareasBase, desde, hasta), [tareasBase, desde, hasta])
  const racha = useMemo(() => rachaDias(tareasBase, hoy), [tareasBase, hoy])
  // el número de arriba es solo de días cerrados dentro del rango visible (a 90 se piden
  // unos días más, desde el lunes, para que las semanas salgan completas)
  const carga = useMemo(() => totalSobrecarga((dias || []).filter((d) => d.fecha >= desde)), [dias, desde])
  // hoy no está en `hoy_dias` (se cierra al reiniciar): su hueco se rellena en vivo
  const diasSinHuecos = useMemo(
    () => sobrecargaSinHuecos([...(dias || []), diaEnCurso(tareasBase, hoy)], desdeCarga, hasta),
    [dias, tareasBase, hoy, desdeCarga, hasta],
  )
  const porSemana = n > 30
  const filasCarga = useMemo(() => (porSemana ? sobrecargaPorSemana(diasSinHuecos) : diasSinHuecos), [diasSinHuecos, porSemana])
  const hayCarga = filasCarga.some((f) => f.planificadas > 0 || f.hechas > 0)

  const proyectos = useMemo(() => plegarOtros(porProyecto(hechas, { proyectos: proyectosTodos, clientes })), [hechas, proyectosTodos, clientes])
  const categorias = useMemo(() => plegarOtros(porCategoria(hechas, categoriasTodas)), [hechas, categoriasTodas])
  const porQ = useMemo(() => porCuadrante(hechas, cuadrantes), [hechas, cuadrantes])

  const semanas = useMemo(() => cumplimientoPorSemana(habitos, marcas, hoy, 8), [habitos, marcas, hoy])
  const haySemanas = semanas.some((s) => s.pct != null)

  const colorProyectoDe = (f) => {
    if (f.clave.startsWith('cliente:')) return 'var(--acento)'
    return proyectosTodos.find((p) => p.id === f.clave)?.color || 'var(--st-creadas)'
  }
  const colorCategoriaDe = (f) => colorCategoria(f.clave) || 'var(--st-creadas)'
  const colorCuadranteDe = (f) => cuadrantes[f.clave]?.color || 'var(--st-creadas)'

  const hayAlgo = tareasBase.length > 0 || hayCarga || habitos.length > 0
  const hayActividad = series.some((s) => s.creadas > 0 || s.hechas > 0)
  const nadaHecho = `Nada hecho en estos ${n} días.`

  const reintentarTodo = () => { setIntentoBase((i) => i + 1); setIntentoDias((i) => i + 1); recargar?.() }
  const reintentarDias = () => setIntentoDias((i) => i + 1)

  // Si la base no se pudo leer, esto no es «no hay nada»: es un fallo, y se dice.
  if (errorBase) {
    return (
      <div className="pantalla">
        <Vacio
          icono={CloudOff}
          titulo="No se pudieron cargar las estadísticas"
          texto={errorBase.message || error?.message || 'Revisa la conexión y vuelve a intentarlo.'}
          accion={<Boton pequeno variante="secundario" icono={<RefreshCw size={18} strokeWidth={1.75} />} onClick={reintentarTodo}>Reintentar</Boton>}
        />
      </div>
    )
  }

  if (!cargandoBase && !cargandoDias && !hayAlgo) {
    return (
      <div className="pantalla">
        <Vacio icono={BarChart3} titulo="Todavía no hay nada que contar" texto="Crea una tarea o un hábito y esto se llena solo." />
      </div>
    )
  }

  return (
    <div className="pantalla stats">
      <Segmentos opciones={RANGOS} valor={n} alCambiar={setN} className="stats-rango" />

      {/* 1 · creadas vs hechas */}
      <section className="seccion">
        <h2 className="seccion-titulo">Creadas frente a hechas, por día</h2>
        <Tarjeta compacta>
          <Contenido cargando={cargandoBase} hay={hayActividad} vacio={`Ni creadas ni hechas en estos ${n} días.`}>
            <GraficoLineas series={series} n={n} />
          </Contenido>
        </Tarjeta>
      </section>

      {/* 2 · los cuatro números (mientras carga, un guion: un cero sería mentira) */}
      <section className="seccion">
        <div className="rejilla-2">
          <NumeroGrande valor={cargandoBase ? '–' : num(hechas.length)} etiqueta={`Hechas en ${n} días`} variante="calida" />
          <NumeroGrande valor={cargandoBase ? '–' : num(hechas.length / n, 1)} etiqueta="Media al día" />
          <NumeroGrande valor={cargandoBase ? '–' : num(racha)} sufijo={cargandoBase ? undefined : racha === 1 ? 'día' : 'días'} etiqueta="Racha con ≥ 1 hecha" />
          <NumeroGrande
            valor={cargandoDias ? '–' : carga.pct == null ? '—' : num(carga.pct)}
            sufijo={!cargandoDias && carga.pct != null ? '%' : undefined}
            etiqueta={errorDias ? 'Días sin leer' : cargandoDias || carga.pct != null ? 'Hechas de lo planificado' : 'Sin días cerrados'}
          />
        </div>
      </section>

      {/* 3 · hechas por proyecto / categoría / cuadrante */}
      <section className="seccion">
        <h2 className="seccion-titulo">Hechas por proyecto</h2>
        <Tarjeta compacta>
          <Contenido cargando={cargandoBase} hay={proyectos.length > 0} vacio={nadaHecho}>
            <BarrasHorizontales filas={proyectos} colorDe={colorProyectoDe} />
          </Contenido>
        </Tarjeta>
      </section>
      <section className="seccion">
        <h2 className="seccion-titulo">Hechas por categoría</h2>
        <Tarjeta compacta>
          <Contenido cargando={cargandoBase} hay={categorias.length > 0} vacio={nadaHecho}>
            <BarrasHorizontales filas={categorias} colorDe={colorCategoriaDe} />
          </Contenido>
        </Tarjeta>
      </section>
      <section className="seccion">
        <h2 className="seccion-titulo">Hechas por cuadrante</h2>
        <Tarjeta compacta>
          <Contenido cargando={cargandoBase} hay={porQ.length > 0} vacio={nadaHecho}>
            <BarrasHorizontales filas={porQ} colorDe={colorCuadranteDe} />
          </Contenido>
        </Tarjeta>
      </section>

      {/* 4 · sobrecarga día a día (hoy en vivo; a 90, por semanas completas) */}
      <section className="seccion">
        <h2 className="seccion-titulo">Sobrecarga: planificadas frente a hechas{porSemana ? ', por semana' : ''}</h2>
        <Tarjeta compacta>
          {errorDias ? (
            <div className="st-vacio st-fallo">
              <span>No se pudieron leer los días.</span>
              <Boton pequeno variante="secundario" icono={<RefreshCw size={18} strokeWidth={1.75} />} onClick={reintentarDias}>Reintentar</Boton>
            </div>
          ) : (
            <Contenido cargando={cargandoDias || cargandoBase} hay={hayCarga} vacio="Nada planificado en este rango todavía.">
              <BarrasDobles filas={filasCarga} porSemana={porSemana} n={n} />
            </Contenido>
          )}
        </Tarjeta>
      </section>

      {/* 5 · hábitos */}
      <section className="seccion">
        <h2 className="seccion-titulo">Hábitos: cumplimiento por semana, últimas 8</h2>
        <Tarjeta compacta>
          <Contenido cargando={cargando} hay={haySemanas} vacio="Sin hábitos todavía.">
            <ColumnasSemanas semanas={semanas} />
          </Contenido>
        </Tarjeta>
      </section>
    </div>
  )
}

/**
 * Lo que va dentro de cada tarjeta según su estado: mientras carga, «Cargando…» (una frase
 * de vacío con los datos aún sin leer sería mentira); sin datos, la frase de vacío; con
 * datos, el gráfico.
 */
function Contenido({ cargando, hay, vacio, children }) {
  if (cargando) return <p className="st-vacio">Cargando…</p>
  if (!hay) return <p className="st-vacio">{vacio}</p>
  return children
}
