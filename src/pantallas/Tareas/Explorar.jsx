import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Building2, ChevronDown, Eye, EyeOff, Search, UserPlus } from 'lucide-react'
import Campo from '../../componentes/Campo.jsx'
import Chip from '../../componentes/Chip.jsx'
import Boton from '../../componentes/Boton.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import FilaTarea from './FilaTarea.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import * as datosTareas from '../../datos/tareas.js'
import { textoFecha } from '../../datos/fechas.js'
// La prioridad del portal se pinta con el color de su cuadrante (urgente→q1…): la misma
// tabla que usa `crear` al traducir en el otro sentido, para no tener dos escalas.
import { CUADRANTE_DE_PRIORIDAD } from '../../datos/catalogos.js'

/**
 * Explorar GrowthInfo (LOGICA §4): TODAS las tareas vivas de la agencia que la RLS deje
 * ver, por cliente, para seguir una o asignármela. Salen de `tasks` (no de la vista),
 * así que viven en estado local de la pestaña: lo que cambie aquí se pinta aquí y se
 * pide `recargar()` para que la vista (Siguiente, Tableros…) se entere.
 */
export default function Explorar() {
  const { yo, hoy, clientes, tareas, cuadrantes, nombrePersona, recargar, avisar } = useDatos()
  const [lista, setLista] = useState(null)      // null = cargando (o fallo, ver `error`)
  const [error, setError] = useState(null)      // ErrorHoy del último intento de leer
  const [busqueda, setBusqueda] = useState('')
  const [abiertos, setAbiertos] = useState({})  // clientId → bool
  const [ocupadas, setOcupadas] = useState({})  // tareaId → bool (botones en curso)
  const [recientes, setRecientes] = useState({}) // tareaId → true mientras la vista no ha confirmado lo escrito aquí

  // Sacada a función para poder reintentar desde el estado de error: si la lectura falla
  // (RLS, red, sesión caducada) una lista vacía sería mentir con cara de éxito.
  const cargar = useCallback(() => {
    let vivo = true
    setError(null)
    setLista(null)
    datosTareas.cargarExplorar()
      .then((ts) => { if (vivo) setLista(ts.filter((t) => !t.hecha)) })
      .catch((e) => { if (vivo) setError(e) })
    return () => { vivo = false }
  }, [])
  useEffect(() => cargar(), [cargar])

  // Lo que la vista ya sabe de una tarea (capa, responsable) manda sobre lo que trajo
  // Explorar: si se sigue desde el detalle, aquí se ve al instante. Salvo para lo que se
  // acaba de escribir AQUÍ: hasta que `recargar()` vuelve, la vista todavía dice lo de antes
  // y el botón saltaría atrás unos cientos de ms.
  const enVista = useMemo(() => new Map(tareas.filter((t) => t.origen === 'portal').map((t) => [t.id, t])), [tareas])

  const grupos = useMemo(() => {
    if (!lista) return []
    const q = busqueda.trim().toLowerCase()
    const por = new Map()
    for (const t0 of lista) {
      const v = enVista.get(t0.id)
      const t = !v ? t0 : recientes[t0.id] ? { ...v, ...t0 } : { ...t0, ...v }
      if (q && !t.titulo.toLowerCase().includes(q)) continue
      if (!por.has(t.clientId)) {
        const c = clientes.find((x) => x.id === t.clientId)
        por.set(t.clientId, { clientId: t.clientId, nombre: c?.nombre || 'Cliente', tareas: [] })
      }
      por.get(t.clientId).tareas.push(t)
    }
    return [...por.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [lista, busqueda, enVista, clientes, recientes])

  const buscando = busqueda.trim().length > 0
  const estaAbierto = (clientId) => (buscando ? abiertos[clientId] !== false : !!abiertos[clientId])
  const alternar = (clientId) => setAbiertos((a) => ({ ...a, [clientId]: !estaAbierto(clientId) }))

  /** Escribe y sustituye la tarea en la lista local; la vista se recarga de fondo. */
  const escribir = async (t, accion) => {
    setOcupadas((o) => ({ ...o, [t.id]: true }))
    try {
      const nueva = await accion()
      setLista((ts) => ts.map((x) => (x.id === t.id ? { ...x, ...nueva } : x)))
      setRecientes((r) => ({ ...r, [t.id]: true }))
      // `recargar` encadena la que hubiera en vuelo: cuando resuelve, la vista ya sabe lo escrito.
      recargar().finally(() => setRecientes((r) => { const c = { ...r }; delete c[t.id]; return c }))
    } catch (e) {
      avisar(e.message || 'No se pudo guardar', 'error')
    } finally {
      setOcupadas((o) => { const c = { ...o }; delete c[t.id]; return c })
    }
  }
  const seguir = (t) => escribir(t, () => datosTareas.seguir(t, !t.seguida))
  const asignarme = (t) => {
    if (!yo?.id) { avisar('No tienes ficha de equipo en GrowthInfo', 'error'); return }
    escribir(t, () => datosTareas.actualizar(t, { responsableId: yo.id }))
  }

  if (error) {
    return (
      <Vacio
        icono={Building2}
        titulo="No se pudo leer GrowthInfo"
        texto={error.message || 'Algo falló al pedir las tareas.'}
        accion={<Boton variante="secundario" pequeno onClick={cargar}>Reintentar</Boton>}
      />
    )
  }
  if (lista === null) return <Vacio icono={Building2} titulo="Leyendo GrowthInfo…" />
  if (!lista.length) return <Vacio icono={Building2} titulo="Nada que explorar" texto="No hay tareas vivas de GrowthInfo a la vista." />

  return (
    <div className="explorar">
      <Campo
        valor={busqueda}
        alCambiar={setBusqueda}
        placeholder="Buscar por título"
        type="search"
        icono={<Search size={18} strokeWidth={1.75} />}
        aria-label="Buscar"
        autoComplete="off"
      />

      {!grupos.length ? (
        <Vacio icono={Search} titulo="Sin resultados" texto="Ninguna tarea lleva ese título." />
      ) : grupos.map((g) => {
        const abierto = estaAbierto(g.clientId)
        return (
          <section key={g.clientId} className="explorar-cliente">
            <button type="button" className="explorar-cabecera" onClick={() => alternar(g.clientId)} aria-expanded={abierto}>
              <span className="explorar-cliente-nombre">{g.nombre}</span>
              <span className="tareas-grupo-cuenta">{g.tareas.length}</span>
              <motion.span animate={{ rotate: abierto ? 180 : 0 }} transition={{ duration: 0.18 }} className="explorar-flecha">
                <ChevronDown size={18} strokeWidth={1.75} />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {abierto && (
                <motion.div
                  key="cuerpo"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                  className="explorar-cuerpo"
                >
                  <div className="tareas-lista">
                    {g.tareas.map((t) => {
                      const esMia = !!yo && t.responsableId === yo.id
                      const q = CUADRANTE_DE_PRIORIDAD[t.prioridadPortal]
                      const ocupada = !!ocupadas[t.id]
                      return (
                        <FilaTarea
                          key={t.id}
                          tarea={t}
                          abrirExterna
                          meta={(
                            <div className="fila-tarea-meta">
                              <span className="explorar-asignado">{esMia ? 'Tuya' : nombrePersona(t.responsableId) || 'Nadie'}</span>
                              {t.prioridadPortal && (
                                <Chip color={q ? cuadrantes[q].color : 'var(--texto-2)'} pequeno>{t.prioridadPortal}</Chip>
                              )}
                              {t.vence && (
                                <span className={`fila-tarea-vence ${datosTareas.esAtrasada(t, hoy) ? 'fila-tarea-vence--atrasada' : ''}`}>
                                  {textoFecha(t.vence)}
                                </span>
                              )}
                            </div>
                          )}
                          debajo={(
                            <div className="explorar-acciones">
                              <Boton
                                variante={t.seguida ? 'primario' : 'secundario'}
                                pequeno
                                cargando={ocupada}
                                icono={t.seguida ? <Eye size={15} strokeWidth={1.75} /> : <EyeOff size={15} strokeWidth={1.75} />}
                                onClick={() => seguir(t)}
                                aria-pressed={t.seguida}
                              >
                                {t.seguida ? 'Siguiendo' : 'Seguir'}
                              </Boton>
                              {!esMia && (
                                <Boton variante="fantasma" pequeno cargando={ocupada} icono={<UserPlus size={15} strokeWidth={1.75} />} onClick={() => asignarme(t)}>
                                  Asignármela
                                </Boton>
                              )}
                            </div>
                          )}
                        />
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )
      })}
    </div>
  )
}
