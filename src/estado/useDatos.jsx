/**
 * useDatos — el único estado compartido de la app (LOGICA §7, final).
 *
 * Un solo usuario y pocos datos: se carga TODO en memoria al entrar y las pantallas
 * derivan lo suyo con las funciones puras de `datos/`. No hay caché por pantalla ni
 * consultas sueltas: una pantalla que necesite algo que no está aquí, lo pide aquí.
 *
 * Arranque (al tener sesión): sembrar (idempotente) → catálogos → tareas/hábitos/marcas
 * → `hoy` = hoyLocal(hora de reinicio) → reiniciar el día. Si esa pasada cerró días,
 * queda un aviso «Ayer: N planificadas · M hechas» para la pantalla Hoy.
 *
 * Realtime SOLO en `tasks` (lo que toca otra gente desde el portal); las `hoy_*` las
 * escribe únicamente esta app, así que basta con recargar al volver el foco.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, isConfigured } from '../lib/supabase.js'
import * as catalogos from '../datos/catalogos.js'
import * as datosTareas from '../datos/tareas.js'
import * as datosHabitos from '../datos/habitos.js'
import { hoyLocal, sumarDias, diasEntre, textoFecha, configurarReinicio } from '../datos/fechas.js'

const Contexto = createContext(null)

// Etiqueta y color de cada cuadrante cuando los ajustes aún no han llegado (o vienen a medias).
const CUADRANTES_BASE = {
  q1: { nombre: 'Urgente e importante', color: '#d7263d' },
  q2: { nombre: 'Importante, no urgente', color: '#ff6a1a' },
  q3: { nombre: 'Urgente, no importante', color: '#e8b13a' },
  q4: { nombre: 'Ni urgente ni importante', color: '#8a8f98' },
}

// Marcas: 13 semanas hacia atrás (Stats a 90 días) y una hacia delante (la rejilla de la
// semana en curso enseña días futuros).
const DIAS_MARCAS_ATRAS = 91
const DIAS_MARCAS_ADELANTE = 7

const DEBOUNCE_REALTIME = 800
const CADA_MINUTO = 60 * 1000

export function ProveedorDatos({ children }) {
  const [sesion, setSesion] = useState(null)
  const [sesionLista, setSesionLista] = useState(false)   // hasta saber si hay sesión persistida no se pinta nada
  const [yo, setYo] = useState(null)
  const [ajustes, setAjustes] = useState(null)
  const [proyectosTodos, setProyectosTodos] = useState([])
  const [clientes, setClientes] = useState([])
  const [equipo, setEquipo] = useState([])
  const [categoriasTodas, setCategoriasTodas] = useState([])
  const [pipelines, setPipelines] = useState([])
  const [tareas, setTareas] = useState([])
  const [habitos, setHabitos] = useState([])
  const [marcas, setMarcas] = useState([])
  const [hoy, setHoy] = useState(() => hoyLocal())
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [avisoDia, setAvisoDia] = useState(null)
  const [aviso, setAviso] = useState(null)                // el toast: { id, texto, tipo }
  const [tareaAbiertaId, setTareaAbiertaId] = useState(null)
  const [tareaExterna, setTareaExterna] = useState(null)  // una que no está en `tareas` (Explorar)
  const [prefillNueva, setPrefillNueva] = useState(null)  // null = la captura rápida está cerrada

  // Refs para que los efectos de larga vida (realtime, foco, minuto) lean lo último sin
  // volver a suscribirse en cada render.
  const ajustesRef = useRef(null)
  const hoyRef = useRef(hoy)
  const recargandoRef = useRef(null)
  ajustesRef.current = ajustes
  hoyRef.current = hoy
  // La hora de reinicio manda en qué día es «hoy» Y en a qué día pertenece cada instante
  // (`diaDe`): se fija en un solo sitio para toda la capa de fechas.
  const horaReinicio = ajustes?.horaReinicio || '04:00'
  configurarReinicio(horaReinicio)
  useEffect(() => { configurarReinicio(horaReinicio) }, [horaReinicio])

  /* ── toast ─────────────────────────────────────────────────────────────── */
  const avisar = useCallback((texto, tipo = 'info') => {
    setAviso({ id: Date.now() + Math.random(), texto: String(texto || ''), tipo })
  }, [])
  const quitarAviso = useCallback(() => setAviso(null), [])

  /* ── sesión ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!isConfigured || !supabase) { setSesionLista(true); return }
    let vivo = true
    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return
      setSesion(data?.session || null)
      setSesionLista(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      if (!vivo) return
      setSesion(s || null)
      setSesionLista(true)
    })
    return () => { vivo = false; sub?.subscription?.unsubscribe() }
  }, [])

  const entrar = useCallback(async (email, password) => {
    if (!supabase) throw new Error('Supabase no está configurado')
    const { data, error: e } = await supabase.auth.signInWithPassword({ email, password })
    if (e) throw new Error(e.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : e.message)
    setSesion(data.session)
    return data.session
  }, [])

  const salir = useCallback(async () => {
    catalogos.vaciarCaches()
    await supabase?.auth.signOut()
    setSesion(null)
    setTareas([]); setHabitos([]); setMarcas([]); setYo(null); setAjustes(null)
    setTareaAbiertaId(null); setPrefillNueva(null); setAvisoDia(null)
  }, [])

  /* ── el día ──────────────────────────────────────────────────────────────── */

  // Cierra los días anteriores a `fecha` y deja el aviso. La RPC devuelve también días
  // que ya estaban cerrados de antes (las hechas conservan su hoy_para), así que sólo
  // avisa de los que se han cerrado en ESTA pasada (cerrado_en reciente).
  const cerrarDias = useCallback(async (fecha) => {
    const dias = await datosTareas.reiniciarDia(fecha)
    const ahora = Date.now()
    const nuevos = dias.filter((d) => d.cerradoEn && ahora - new Date(d.cerradoEn).getTime() < 2 * CADA_MINUTO)
    if (!nuevos.length) return
    const d = nuevos[nuevos.length - 1]
    const cuando = diasEntre(d.fecha, fecha) === 1 ? 'Ayer' : textoFecha(d.fecha)
    setAvisoDia({ fecha: d.fecha, planificadas: d.planificadas, hechas: d.hechas, texto: `${cuando}: ${d.planificadas} planificadas · ${d.hechas} hechas` })
  }, [])
  const descartarAviso = useCallback(() => setAvisoDia(null), [])

  /* ── cargas ──────────────────────────────────────────────────────────────── */

  const cargarCatalogos = useCallback(async () => {
    const [a, p, c, e, cat, pipes, ficha] = await Promise.all([
      catalogos.cargarAjustes(),
      catalogos.cargarProyectos({ incluirArchivados: true }),
      catalogos.cargarClientes(),
      catalogos.cargarEquipo(),
      catalogos.cargarCategorias({ incluirArchivadas: true }),
      catalogos.cargarPipelines({ cache: false }),
      catalogos.cargarMiFicha(),
    ])
    setAjustes(a); setProyectosTodos(p); setClientes(c); setEquipo(e); setCategoriasTodas(cat); setPipelines(pipes); setYo(ficha)
    return a
  }, [])

  const cargarDatos = useCallback(async (fecha) => {
    const [t, h, m] = await Promise.all([
      datosTareas.cargarTodas(),
      datosHabitos.cargarHabitos(),
      datosHabitos.cargarMarcas(sumarDias(fecha, -DIAS_MARCAS_ATRAS), sumarDias(fecha, DIAS_MARCAS_ADELANTE)),
    ])
    setTareas(t); setHabitos(h); setMarcas(m)
  }, [])

  /**
   * Recarga tareas, hábitos y marcas (y con `{ catalogos: true }` también los catálogos:
   * lo que Ajustes toca). Si llega una recarga mientras otra está en vuelo, NO se devuelve
   * la vieja: esa pudo arrancar antes de una escritura (foco, realtime) y traería datos
   * anteriores que pisarían el parche optimista. Se apunta «hace falta otra» y, al acabar
   * la que corre, se lanza una sola más (varias peticiones solapadas se funden en una).
   */
  const otraPendienteRef = useRef(null) // null | { catalogos: bool }
  const recargar = useCallback(async ({ catalogos: conCatalogos = false } = {}) => {
    if (recargandoRef.current) {
      otraPendienteRef.current = { catalogos: conCatalogos || !!otraPendienteRef.current?.catalogos }
      // la promesa en curso no resuelve hasta que la encadenada termina: quien espere, espera a las dos
      return recargandoRef.current
    }
    const p = (async () => {
      try {
        setError(null)
        if (conCatalogos) { catalogos.vaciarCaches(); await cargarCatalogos() }
        await cargarDatos(hoyRef.current)
      } catch (e) {
        setError(e); avisar(e.message, 'error')
      } finally {
        recargandoRef.current = null
      }
      // lo que se pidió mientras cargábamos: una sola recarga más, con lo más amplio pedido
      const otra = otraPendienteRef.current
      if (otra) {
        otraPendienteRef.current = null
        await recargarRef.current(otra)
      }
    })()
    recargandoRef.current = p
    return p
  }, [cargarCatalogos, cargarDatos, avisar])
  const recargarRef = useRef(recargar)
  recargarRef.current = recargar

  // Arranque con sesión: todo en orden (sembrar antes que nada; el día antes que las tareas).
  const usuarioId = sesion?.user?.id || null
  useEffect(() => {
    if (!usuarioId) { setCargando(false); return }
    let vivo = true
    ;(async () => {
      setCargando(true); setError(null)
      try {
        await catalogos.sembrar()
        const a = await cargarCatalogos()
        configurarReinicio(a.horaReinicio)
        const h = hoyLocal(a.horaReinicio)
        if (!vivo) return
        setHoy(h); hoyRef.current = h
        await cerrarDias(h)
        await cargarDatos(h)
      } catch (e) {
        if (!vivo) return
        setError(e); avisar(e.message, 'error')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [usuarioId, cargarCatalogos, cargarDatos, cerrarDias, avisar])

  /* ── realtime en tasks + foco + minuto ───────────────────────────────────── */
  useEffect(() => {
    if (!usuarioId || !supabase) return
    let temporizador = null
    const pedir = () => {
      clearTimeout(temporizador)
      temporizador = setTimeout(() => recargar(), DEBOUNCE_REALTIME)
    }
    const canal = supabase
      .channel('hoy-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, pedir)
      .subscribe()

    const alVolver = () => { if (document.visibilityState === 'visible') recargar() }
    document.addEventListener('visibilitychange', alVolver)

    // El «hoy» cambia a la hora de reinicio, no a medianoche: se mira cada minuto y, si
    // ha cambiado, se cierra el día que acaba antes de recargar.
    const reloj = setInterval(async () => {
      const h = hoyLocal(ajustesRef.current?.horaReinicio || '04:00')
      if (h === hoyRef.current) return
      hoyRef.current = h
      setHoy(h)
      try { await cerrarDias(h) } catch (e) { avisar(e.message, 'error') }
      recargar()
    }, CADA_MINUTO)

    return () => {
      clearTimeout(temporizador)
      supabase.removeChannel(canal)
      document.removeEventListener('visibilitychange', alVolver)
      clearInterval(reloj)
    }
  }, [usuarioId, recargar, cerrarDias, avisar])

  /* ── tareas: abrir, nueva, parches locales (optimismo) ───────────────────── */

  // `abrirTarea(id)` para una de la lista; `abrirTarea(id, tarea)` para una que no está
  // en `tareas` (Explorar GrowthInfo): se guarda aparte para poder pintarla.
  const abrirTarea = useCallback((id, tarea = null) => {
    setTareaExterna(tarea && tarea.id === id ? tarea : null)
    setTareaAbiertaId(id)
  }, [])
  const cerrarTarea = useCallback(() => { setTareaAbiertaId(null); setTareaExterna(null) }, [])
  const nuevaTarea = useCallback((prefill = {}) => setPrefillNueva({ ...(prefill || {}) }), [])
  const cerrarNueva = useCallback(() => setPrefillNueva(null), [])

  /** Sustituye (o añade) una tarea en memoria sin ir a la base: lo optimista y lo releído. */
  const actualizarLocal = useCallback((tarea) => {
    if (!tarea?.id) return
    setTareas((ts) => {
      const i = ts.findIndex((t) => t.id === tarea.id && t.origen === tarea.origen)
      if (i === -1) return [...ts, tarea]
      const copia = ts.slice(); copia[i] = tarea; return copia
    })
    setTareaExterna((x) => (x && x.id === tarea.id ? tarea : x))
  }, [])
  const quitarLocal = useCallback((id) => {
    setTareas((ts) => ts.filter((t) => t.id !== id))
    setTareaExterna((x) => (x && x.id === id ? null : x))
    setTareaAbiertaId((a) => (a === id ? null : a))
  }, [])

  /* ── derivadas: nombres y colores desde los catálogos ─────────────────────── */

  const cuadrantes = useMemo(() => {
    const c = ajustes?.cuadrantes || {}
    const out = {}
    for (const q of Object.keys(CUADRANTES_BASE)) out[q] = { ...CUADRANTES_BASE[q], ...(c[q] || {}) }
    return out
  }, [ajustes])
  const listaCuadrantes = useMemo(() => Object.entries(cuadrantes).map(([clave, v]) => ({ clave, ...v })), [cuadrantes])

  const proyectos = useMemo(() => proyectosTodos.filter((p) => !p.archivadoEn), [proyectosTodos])
  const categorias = useMemo(() => categoriasTodas.filter((c) => !c.archivadoEn), [categoriasTodas])

  const nombreProyecto = useCallback((t) => {
    if (!t) return null
    if (t.clientId) return clientes.find((c) => c.id === t.clientId)?.nombre || t.clientId
    if (t.proyectoId) return proyectosTodos.find((p) => p.id === t.proyectoId)?.nombre || null
    return null
  }, [clientes, proyectosTodos])
  // Un cliente no tiene color propio en `clients`: se pinta con el acento.
  const colorProyecto = useCallback((t) => {
    if (!t) return null
    if (t.clientId) return 'var(--acento)'
    if (t.proyectoId) return proyectosTodos.find((p) => p.id === t.proyectoId)?.color || null
    return null
  }, [proyectosTodos])
  const nombreCategoria = useCallback((clave) => (clave ? categoriasTodas.find((c) => c.clave === clave)?.nombre || clave : null), [categoriasTodas])
  const colorCategoria = useCallback((clave) => (clave ? categoriasTodas.find((c) => c.clave === clave)?.color || null : null), [categoriasTodas])
  // Acepta el id de la ficha de equipo o el user_id de auth (los comentarios llevan el segundo).
  const nombrePersona = useCallback((id) => {
    if (!id) return null
    const m = equipo.find((p) => p.id === id || p.userId === id)
    if (m) return m.nombre
    if (yo && (yo.id === id || yo.userId === id)) return yo.nombre
    if (sesion?.user?.id === id) return sesion.user.email
    return null
  }, [equipo, yo, sesion])

  const tareaAbierta = useMemo(() => {
    if (!tareaAbiertaId) return null
    return tareas.find((t) => t.id === tareaAbiertaId) || (tareaExterna?.id === tareaAbiertaId ? tareaExterna : null)
  }, [tareaAbiertaId, tareas, tareaExterna])

  const valor = useMemo(() => ({
    // sesión
    sesion, sesionLista, entrar, salir, yo,
    // catálogos
    ajustes, proyectos, proyectosTodos, clientes, equipo, categorias, categoriasTodas, pipelines,
    cuadrantes, listaCuadrantes,
    // datos
    tareas, habitos, marcas, hoy, cargando, error, recargar,
    actualizarLocal, quitarLocal, setAjustes, setMarcas, setHabitos,
    // el día
    avisoDia, descartarAviso,
    // toast
    aviso, avisar, quitarAviso,
    // hojas
    tareaAbiertaId, tareaAbierta, abrirTarea, cerrarTarea,
    prefillNueva, nuevaTarea, cerrarNueva,
    // nombres y colores
    nombreProyecto, colorProyecto, nombreCategoria, colorCategoria, nombrePersona,
  }), [
    sesion, sesionLista, entrar, salir, yo, ajustes, proyectos, proyectosTodos, clientes, equipo, categorias, categoriasTodas,
    pipelines, cuadrantes, listaCuadrantes, tareas, habitos, marcas, hoy, cargando, error, recargar, actualizarLocal, quitarLocal,
    avisoDia, descartarAviso, aviso, avisar, quitarAviso, tareaAbiertaId, tareaAbierta, abrirTarea, cerrarTarea, prefillNueva,
    nuevaTarea, cerrarNueva, nombreProyecto, colorProyecto, nombreCategoria, colorCategoria, nombrePersona,
  ])

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

/** El contexto. Fuera del proveedor lanza: es un error de montaje, no un caso a tolerar. */
export function useDatos() {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useDatos() sólo funciona dentro de <ProveedorDatos>')
  return ctx
}

/** Variante tolerante para pantallas que también viven fuera del proveedor (#acceso). */
export function useDatosOpcional() {
  return useContext(Contexto)
}
