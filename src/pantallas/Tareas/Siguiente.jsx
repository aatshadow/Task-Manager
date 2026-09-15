import { useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ListChecks, Sun } from 'lucide-react'
import Segmentos from '../../componentes/Segmentos.jsx'
import Chip from '../../componentes/Chip.jsx'
import Boton from '../../componentes/Boton.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import FilaTarea from './FilaTarea.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import * as datosTareas from '../../datos/tareas.js'
import { usarGuardar, usarCompletar } from '../../estado/usarGuardar.js'

const AGRUPACIONES = [
  { valor: 'proyecto', etiqueta: 'Proyecto' },
  { valor: 'cuadrante', etiqueta: 'Cuadrante' },
  { valor: 'categoria', etiqueta: 'Categoría' },
]

// Clave de proyecto de una tarea: cliente, proyecto propio o «sin». Con prefijo para que
// un uuid de cliente no se confunda con uno de proyecto.
const claveProyecto = (t) => (t.clientId ? `c:${t.clientId}` : t.proyectoId ? `p:${t.proyectoId}` : 'sin')

/**
 * Siguiente = todo lo vivo que no está en la nevera (LOGICA §5). Es la lista de trabajo:
 * de aquí sale lo que se planifica para Hoy. Se agrupa por proyecto, cuadrante o
 * categoría y se filtra por proyecto y por responsable con chips; los filtros salen de
 * las tareas que hay, no de los catálogos enteros (un chip que no filtra nada estorba).
 */
export default function Siguiente({ tareas }) {
  const { hoy, categorias, listaCuadrantes, nombreProyecto, colorProyecto, nombreCategoria, colorCategoria, nombrePersona } = useDatos()
  const guardar = usarGuardar()

  const [agrupar, setAgrupar] = useState('proyecto')
  const [filtroProyecto, setFiltroProyecto] = useState(null)
  const [filtroPersona, setFiltroPersona] = useState(null)

  /* ── filtros: sólo lo que existe en la lista ──────────────────────────── */
  const opcionesProyecto = useMemo(() => {
    const vistos = new Map()
    for (const t of tareas) {
      const k = claveProyecto(t)
      if (k === 'sin' || vistos.has(k)) continue
      vistos.set(k, { clave: k, nombre: nombreProyecto(t) || '—', color: colorProyecto(t) || 'var(--texto-2)' })
    }
    return [...vistos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [tareas, nombreProyecto, colorProyecto])

  const opcionesPersona = useMemo(() => {
    const vistos = new Map()
    for (const t of tareas) {
      if (!t.responsableId || vistos.has(t.responsableId)) continue
      vistos.set(t.responsableId, { clave: t.responsableId, nombre: nombrePersona(t.responsableId) || 'Alguien' })
    }
    return [...vistos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [tareas, nombrePersona])

  // El filtro que se aplica es el que todavía tiene chip: si se completan las tareas del
  // proyecto elegido hasta que la fila de chips deja de pintarse, el estado guardado seguiría
  // filtrando una lista que ya no ofrece manera de quitarlo. Se deriva, no se confía en él.
  const filtroProyectoEfectivo = opcionesProyecto.length > 1 && opcionesProyecto.some((p) => p.clave === filtroProyecto) ? filtroProyecto : null
  const filtroPersonaEfectivo = opcionesPersona.some((m) => m.clave === filtroPersona) ? filtroPersona : null

  const filtradas = useMemo(() => tareas.filter((t) =>
    (!filtroProyectoEfectivo || claveProyecto(t) === filtroProyectoEfectivo)
    && (!filtroPersonaEfectivo || t.responsableId === filtroPersonaEfectivo)), [tareas, filtroProyectoEfectivo, filtroPersonaEfectivo])

  /* ── grupos, en el orden que el usuario espera: catálogo primero, «sin» al final ── */
  const grupos = useMemo(() => {
    const por = new Map()
    const meter = (clave, nombre, color, t) => {
      if (!por.has(clave)) por.set(clave, { clave, nombre, color, tareas: [] })
      por.get(clave).tareas.push(t)
    }
    for (const t of filtradas) {
      if (agrupar === 'proyecto') meter(claveProyecto(t), nombreProyecto(t) || 'Sin proyecto', colorProyecto(t), t)
      else if (agrupar === 'cuadrante') {
        const q = listaCuadrantes.find((x) => x.clave === t.cuadrante)
        meter(q?.clave || 'sin', q?.nombre || 'Sin cuadrante', q?.color, t)
      } else meter(t.categoria || 'sin', nombreCategoria(t.categoria) || 'Sin categoría', colorCategoria(t.categoria), t)
    }
    const lista = [...por.values()]
    const orden = (g) => {
      if (g.clave === 'sin') return Number.MAX_SAFE_INTEGER
      if (agrupar === 'cuadrante') return listaCuadrantes.findIndex((q) => q.clave === g.clave)
      if (agrupar === 'categoria') { const i = categorias.findIndex((c) => c.clave === g.clave); return i === -1 ? 999 : i }
      return 0
    }
    lista.sort((a, b) => orden(a) - orden(b) || a.nombre.localeCompare(b.nombre, 'es'))
    // dentro de cada grupo: atrasadas primero, después por fecha, después como venían
    for (const g of lista) {
      g.tareas.sort((a, b) => {
        const va = a.vence || '9999', vb = b.vence || '9999'
        return va < vb ? -1 : va > vb ? 1 : 0
      })
    }
    return lista
  }, [filtradas, agrupar, listaCuadrantes, categorias, nombreProyecto, colorProyecto, nombreCategoria, colorCategoria])

  /* ── acciones ─────────────────────────────────────────────────────────── */
  const completar = usarCompletar()
  const alternarHoy = (t) => {
    const enHoy = datosTareas.esDeHoy(t, hoy)
    const fecha = enHoy ? null : hoy
    return guardar(t, { hoyPara: fecha }, () => datosTareas.planificarHoy(t, fecha))
  }

  const hayFiltros = opcionesProyecto.length > 1 || opcionesPersona.length > 0

  return (
    <div className="siguiente">
      <Segmentos opciones={AGRUPACIONES} valor={agrupar} alCambiar={setAgrupar} />

      {hayFiltros && (
        <div className="tareas-filtros">
          {opcionesProyecto.length > 1 && (
            <div className="tareas-filtros-fila" role="group" aria-label="Filtrar por proyecto">
              {opcionesProyecto.map((p) => (
                <Chip key={p.clave} color={p.color} pequeno activo={filtroProyectoEfectivo === p.clave}
                  onClick={() => setFiltroProyecto(filtroProyectoEfectivo === p.clave ? null : p.clave)}>
                  {p.nombre}
                </Chip>
              ))}
            </div>
          )}
          {opcionesPersona.length > 0 && (
            <div className="tareas-filtros-fila" role="group" aria-label="Filtrar por responsable">
              {opcionesPersona.map((m) => (
                <Chip key={m.clave} color="var(--texto-2)" pequeno punto={false} activo={filtroPersonaEfectivo === m.clave}
                  onClick={() => setFiltroPersona(filtroPersonaEfectivo === m.clave ? null : m.clave)}>
                  {m.nombre}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}

      {!grupos.length ? (
        <Vacio
          icono={ListChecks}
          titulo={filtroProyectoEfectivo || filtroPersonaEfectivo ? 'Nada con ese filtro' : 'Nada pendiente'}
          texto={filtroProyectoEfectivo || filtroPersonaEfectivo ? 'Quita un filtro para ver el resto.' : 'Todo lo vivo que no está hecho aparece aquí.'}
        />
      ) : grupos.map((g) => (
        <section key={g.clave} className="tareas-grupo">
          <div className="tareas-grupo-titulo">
            {g.color && <span className="tareas-grupo-punto" style={{ background: g.color }} />}
            <span>{g.nombre}</span>
            <span className="tareas-grupo-cuenta">{g.tareas.length}</span>
          </div>
          <div className="tareas-lista">
            <AnimatePresence initial={false}>
              {g.tareas.map((t) => {
                const enHoy = datosTareas.esDeHoy(t, hoy)
                return (
                  <FilaTarea
                    key={t.id}
                    tarea={t}
                    conMarca
                    alCompletar={(hecha) => completar(t, hecha)}
                    acciones={(
                      <Boton
                        variante={enHoy ? 'primario' : 'secundario'}
                        pequeno
                        icono={<Sun size={15} strokeWidth={1.75} />}
                        onClick={() => alternarHoy(t)}
                        aria-label={enHoy ? 'Quitar de Hoy' : 'Planificar para hoy'}
                        aria-pressed={enHoy}
                        className="siguiente-hoy"
                      >
                        Hoy
                      </Boton>
                    )}
                  />
                )
              })}
            </AnimatePresence>
          </div>
        </section>
      ))}
    </div>
  )
}
