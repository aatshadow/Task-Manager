import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, Reorder, motion, useDragControls } from 'framer-motion'
import { CalendarDays, Clock, CloudOff, GripVertical, ListPlus, Repeat, Sun, X } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import NumeroGrande from '../../componentes/NumeroGrande.jsx'
import Chip from '../../componentes/Chip.jsx'
import Marca from '../../componentes/Marca.jsx'
import Boton from '../../componentes/Boton.jsx'
import Vacio from '../../componentes/Vacio.jsx'
import HojaPlanificar from './HojaPlanificar.jsx'
import HabitosHoy from './HabitosHoy.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import { usarGuardar, usarCompletar } from '../../estado/usarGuardar.js'
import * as datosTareas from '../../datos/tareas.js'
import { esAtrasada, esBandeja, esDeHoy } from '../../datos/tareas.js'
import { diaDe } from '../../datos/fechas.js'
import './Hoy.css'

/**
 * 2day — la pantalla de apertura (LOGICA §5). La única lista que se ve al abrir.
 *
 * Qué se pinta, en orden: el aviso del día cerrado (si lo hay) · la primera de Hoy en la
 * tarjeta cálida · los cuatro números · la lista de Hoy (marcar, reordenar) · los hábitos
 * que tocan. La cabecera («Hola Alex» + pendientes) la pone App, no esta pantalla.
 *
 * «En Hoy» = planificada para hoy y no hecha (`esDeHoy`: también las de días anteriores
 * que el reinicio aún no haya limpiado, para no esconder nada). Las hechas que estaban
 * planificadas para hoy se quedan al final, tachadas: son la historia del día.
 *
 * Todo cambio es optimista (se pinta → se escribe → se sustituye por lo releído →
 * `recargar()` de fondo); si falla, se restaura y se avisa. Nada toca Supabase desde aquí.
 */
export default function Hoy({ onIrA } = {}) {
  const {
    tareas, hoy, cargando, error, avisoDia, descartarAviso,
    abrirTarea, actualizarLocal, recargar, avisar,
  } = useDatos()
  const [planificando, setPlanificando] = useState(false)

  /* ── derivadas ─────────────────────────────────────────────────────────── */
  const vivas = useMemo(() => (tareas || []).filter((t) => !t.archivadoEn), [tareas])

  // Pendientes de Hoy: por orden (lo que Alex ha arrastrado), luego por hora, luego por antigüedad.
  const pendientes = useMemo(() => vivas
    .filter((t) => !t.hecha && esDeHoy(t, hoy))
    .sort((a, b) => (a.orden - b.orden)
      || compararHora(a.horaInicio, b.horaInicio)
      || (a.posicion - b.posicion)
      || String(a.creadaEn || '').localeCompare(String(b.creadaEn || ''))), [vivas, hoy])

  // Hechas de hoy que estaban planificadas para hoy: al final, tachadas.
  const hechas = useMemo(() => vivas
    .filter((t) => t.hecha && t.hoyPara === hoy)
    .sort((a, b) => String(b.hechaEn || '').localeCompare(String(a.hechaEn || ''))), [vivas, hoy])

  const numeros = useMemo(() => ({
    hechasHoy: vivas.filter((t) => t.hecha && diaDe(t.hechaEn) === hoy).length,
    enHoy: pendientes.length,
    atrasadas: vivas.filter((t) => esAtrasada(t, hoy)).length,
    bandeja: vivas.filter(esBandeja).length,
  }), [vivas, pendientes, hoy])

  const destacada = pendientes[0] || null

  /* ── acciones ──────────────────────────────────────────────────────────── */

  // El patrón de cada cambio (optimista → escritura → releída → recarga) vive en estado/usarGuardar.
  const guardar = usarGuardar()
  const completar = usarCompletar()

  // La recién traída va AL FINAL: con el orden 0 por defecto de la capa se colaría arriba y
  // podría convertirse en la destacada, desplazando a la que Alex había puesto primera.
  const planificar = (tarea) => {
    const orden = pendientes.reduce((max, t) => Math.max(max, t.orden ?? 0), -1) + 1
    return guardar(tarea, { hoyPara: hoy, orden }, () => datosTareas.planificarHoy(tarea, hoy, { orden }))
  }

  /**
   * Reordenar: el orden nuevo es el índice en la lista. Sólo se escriben las capas cuyo
   * orden cambia; todas a la vez y, si alguna falla, se vuelve al orden de antes entero
   * (un orden a medias es peor que el viejo).
   */
  const guardarOrden = async (ids) => {
    const porId = new Map(pendientes.map((t) => [t.id, t]))
    const cambios = ids.map((id, i) => ({ t: porId.get(id), orden: i })).filter((c) => c.t && c.t.orden !== c.orden)
    if (!cambios.length) return
    cambios.forEach((c) => actualizarLocal({ ...c.t, orden: c.orden }))
    try {
      await Promise.all(cambios.map((c) => datosTareas.capa(c.t.id, c.t.origen, { orden: c.orden })))
      recargar()
    } catch (e) {
      cambios.forEach((c) => actualizarLocal(c.t))
      avisar(e.message || 'No se pudo guardar el orden', 'error')
    }
  }

  /* ── la lista que se pinta (derivada, no copiada) ──────────────────────── */
  // Reorder necesita una lista que cambie en cada movimiento, pero el contexto sólo se toca
  // al soltar. En vez de duplicar `pendientes` en estado (que iría un render por detrás y
  // pintaría una tarea dos veces al completarla), se guarda sólo el ORDEN de ids mientras
  // se arrastra y la lista se calcula siempre a partir de `pendientes`: lo que desaparece
  // del contexto desaparece de la lista en el mismo render.
  const [ordenArrastre, setOrdenArrastre] = useState(null) // [id] | null
  const lista = useMemo(() => {
    if (!ordenArrastre) return pendientes
    const pos = new Map(ordenArrastre.map((id, i) => [id, i]))
    const rango = (t) => (pos.has(t.id) ? pos.get(t.id) : ordenArrastre.length) // las nuevas, al final
    return [...pendientes].sort((a, b) => rango(a) - rango(b))
  }, [pendientes, ordenArrastre])
  const listaRef = useRef(lista)
  listaRef.current = lista

  const alReordenar = (valores) => setOrdenArrastre(valores.map((t) => t.id))
  const alSoltar = () => {
    // el último onReorder puede estar aún sin pintar: se lee la lista tras el flush.
    // guardarOrden escribe el orden en el contexto (optimista) antes de soltar el orden
    // local, así el paso de uno a otro no mueve ninguna fila.
    setTimeout(() => {
      guardarOrden(listaRef.current.map((t) => t.id))
      setOrdenArrastre(null)
    }, 0)
  }

  const irACalendario = onIrA ? () => onIrA('calendario') : null
  const irATareas = onIrA ? () => onIrA('tareas') : null
  const hayLista = lista.length > 0 || hechas.length > 0
  const arrancando = cargando && !vivas.length
  const sinCargar = !!error && !vivas.length && !cargando

  return (
    <div className="pantalla hoy">
      {/* aviso del día que se acaba de cerrar */}
      <AnimatePresence initial={false}>
        {avisoDia && (
          <motion.div
            key={avisoDia.fecha}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
          >
            <Tarjeta compacta className="hoy-aviso-dia" role="status">
              <span className="hoy-aviso-icono"><Sun size={18} strokeWidth={1.75} /></span>
              <span className="hoy-aviso-texto">{avisoDia.texto}</span>
              <Boton variante="fantasma" pequeno icono={<X size={18} strokeWidth={1.75} />} aria-label="Cerrar aviso" onClick={descartarAviso} />
            </Tarjeta>
          </motion.div>
        )}
      </AnimatePresence>

      {/* la primera de Hoy */}
      <AnimatePresence initial={false} mode="popLayout">
        {destacada && (
          <motion.div
            key={destacada.id}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <Destacada tarea={destacada} alAbrir={() => abrirTarea(destacada.id)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* «Hoy» + calendario */}
      <div className="hoy-cabeza-seccion">
        <h2 className="t-titulo">Hoy</h2>
        {irACalendario
          ? <Boton variante="fantasma" icono={<CalendarDays size={22} strokeWidth={1.75} />} aria-label="Ir al calendario" onClick={irACalendario} />
          : <span className="hoy-cabeza-icono" aria-hidden="true"><CalendarDays size={22} strokeWidth={1.75} /></span>}
      </div>

      <div className="rejilla-2">
        {/* sin datos (arrancando o fallo de carga) los números no fingen un día limpio a 0 */}
        <NumeroGrande valor={arrancando || sinCargar ? '–' : numeros.hechasHoy} etiqueta="Hechas hoy" />
        <NumeroGrande valor={arrancando || sinCargar ? '–' : numeros.enHoy} etiqueta="En Hoy" />
        <NumeroGrande valor={arrancando || sinCargar ? '–' : numeros.atrasadas} etiqueta="Atrasadas" onClick={irATareas || undefined} />
        <NumeroGrande valor={arrancando || sinCargar ? '–' : numeros.bandeja} etiqueta="Bandeja" onClick={irATareas || undefined} />
      </div>

      {/* la lista de Hoy */}
      <section className="seccion">
        <div className="hoy-lista-cabeza">
          <div className="seccion-titulo">Lista de hoy</div>
          <Boton variante="secundario" pequeno icono={<ListPlus size={18} strokeWidth={1.75} />} onClick={() => setPlanificando(true)}>
            Planificar
          </Boton>
        </div>

        {arrancando ? (
          <p className="hoy-cargando t-terciario" role="status">Cargando…</p>
        ) : sinCargar ? (
          <Vacio
            icono={CloudOff}
            titulo="No se pudo cargar"
            texto={error?.message || 'Comprueba la conexión y vuelve a intentarlo.'}
            accion={<Boton variante="secundario" pequeno onClick={() => recargar()}>Reintentar</Boton>}
          />
        ) : !hayLista ? (
          <Vacio
            icono={Sun}
            titulo="Nada planificado"
            texto="Toca + o Planificar."
            accion={<Boton variante="primario" pequeno onClick={() => setPlanificando(true)}>Planificar</Boton>}
          />
        ) : (
          <>
            <Reorder.Group as="ul" axis="y" values={lista} onReorder={alReordenar} className="hoy-lista">
              {lista.map((t) => (
                <FilaHoy
                  key={t.id}
                  tarea={t}
                  alAbrir={() => abrirTarea(t.id)}
                  alCompletar={(hecha) => completar(t, hecha)}
                  alSoltar={alSoltar}
                />
              ))}
            </Reorder.Group>

            {hechas.length > 0 && (
              <ul className="hoy-lista hoy-hechas">
                <AnimatePresence initial={false}>
                  {hechas.map((t) => (
                    <motion.li
                      key={t.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="hoy-fila hoy-fila--hecha"
                      onClick={() => abrirTarea(t.id)}
                    >
                      <Marca hecha alCambiar={(hecha) => completar(t, hecha)} aria-label={`Reabrir ${t.titulo}`} />
                      <CuerpoFila tarea={t} />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </>
        )}
      </section>

      <HabitosHoy />

      <HojaPlanificar abierta={planificando} alCerrar={() => setPlanificando(false)} alPlanificar={planificar} />
    </div>
  )
}

/* ── piezas ────────────────────────────────────────────────────────────────── */

// Horas 'HH:MM' comparables como texto; sin hora va al final.
function compararHora(a, b) {
  if (a === b) return 0
  if (!a) return 1
  if (!b) return -1
  return a < b ? -1 : 1
}

/** La tarjeta cálida: título, proyecto, quién, y la hora (o «Ahora»). */
function Destacada({ tarea: t, alAbrir }) {
  const { nombreProyecto, colorProyecto, nombrePersona } = useDatos()
  const proyecto = nombreProyecto(t)
  const personas = useMemo(() => {
    // responsable primero, participantes después, sin repetir
    const ids = [t.responsableId, ...(t.participantes || [])].filter(Boolean)
    return [...new Set(ids)].map((id) => ({ id, nombre: nombrePersona(id) || '?' }))
  }, [t.responsableId, t.participantes, nombrePersona])
  const hora = t.horaInicio ? `${t.horaInicio}${t.horaFin ? ` – ${t.horaFin}` : ''}` : 'Ahora'

  return (
    <Tarjeta variante="calida" onClick={alAbrir} className="hoy-destacada" aria-label={`Abrir ${t.titulo}`}>
      <div className="hoy-destacada-cabeza">
        <div style={{ minWidth: 0 }}>
          <div className="hoy-destacada-etiqueta">Primera de hoy</div>
          <div className="hoy-destacada-titulo">{t.titulo}</div>
        </div>
        <span className="hoy-destacada-hora"><Clock size={14} strokeWidth={2} />{hora}</span>
      </div>
      <div className="hoy-destacada-pie">
        <div className="fila" style={{ minWidth: 0, flexWrap: 'wrap', gap: 6 }}>
          {proyecto && <Chip pequeno color={colorProyecto(t)}>{proyecto}</Chip>}
          {!proyecto && <span className="t-terciario">Sin proyecto</span>}
        </div>
        {personas.length > 0 && <Avatares personas={personas} />}
      </div>
    </Tarjeta>
  )
}

const MAX_AVATARES = 3

function Avatares({ personas }) {
  const visibles = personas.slice(0, MAX_AVATARES)
  const resto = personas.length - visibles.length
  return (
    <div className="hoy-avatares" aria-label={personas.map((p) => p.nombre).join(', ')}>
      {visibles.map((p) => (
        <span key={p.id} className="hoy-avatar" title={p.nombre}>{p.nombre.slice(0, 1).toUpperCase()}</span>
      ))}
      {resto > 0 && <span className="hoy-avatar hoy-avatar--mas">+{resto}</span>}
    </div>
  )
}

/** Título + chips (proyecto, cuadrante) + hora: lo común a filas pendientes y hechas. */
function CuerpoFila({ tarea: t }) {
  const { nombreProyecto, colorProyecto, cuadrantes } = useDatos()
  const proyecto = nombreProyecto(t)
  const q = t.cuadrante ? cuadrantes[t.cuadrante] : null
  return (
    <>
      <div className="hoy-fila-cuerpo">
        <div className="hoy-fila-titulo">{t.titulo}</div>
        {(proyecto || q) && (
          <div className="hoy-fila-chips">
            {proyecto && <Chip pequeno color={colorProyecto(t)}>{proyecto}</Chip>}
            {q && <Chip pequeno color={q.color}>{q.nombre}</Chip>}
          </div>
        )}
      </div>
      {t.repetir && <span className="hoy-fila-repite" aria-label="Se repite"><Repeat size={12} strokeWidth={2} /></span>}
      {t.horaInicio && <span className="hoy-fila-hora">{t.horaInicio}</span>}
    </>
  )
}

/**
 * Una fila pendiente, reordenable. El arrastre lo inicia SÓLO el asa (dragListener=false):
 * así un toque en la fila abre la tarea y el pulgar puede hacer scroll por encima sin
 * levantar nada. `onDragEnd` de Reorder.Item avisa al padre para que guarde el orden.
 *
 * Con ratón, el navegador dispara `click` en el li si el pointerup tras arrastrar cae
 * sobre la fila (framer-motion no lo suprime): `acabaDeArrastrar` lo traga. Se limpia con
 * un temporizador porque el click llega DESPUÉS de onDragEnd, cuando el estado ya está vacío.
 */
const MS_TRAS_ARRASTRE = 150

function FilaHoy({ tarea: t, alAbrir, alCompletar, alSoltar }) {
  const controles = useDragControls()
  const [arrastrando, setArrastrando] = useState(false)
  const acabaDeArrastrar = useRef(false)
  const alTerminarArrastre = () => {
    setArrastrando(false)
    acabaDeArrastrar.current = true
    setTimeout(() => { acabaDeArrastrar.current = false }, MS_TRAS_ARRASTRE)
    alSoltar()
  }
  return (
    <Reorder.Item
      as="li"
      value={t}
      dragListener={false}
      dragControls={controles}
      onDragStart={() => setArrastrando(true)}
      onDragEnd={alTerminarArrastre}
      className={`hoy-fila${arrastrando ? ' hoy-fila--arrastrando' : ''}`}
      onClick={() => { if (acabaDeArrastrar.current) return; alAbrir() }}
      whileDrag={{ scale: 1.02 }}
    >
      <Marca hecha={false} alCambiar={alCompletar} aria-label={`Completar ${t.titulo}`} />
      <CuerpoFila tarea={t} />
      <span
        className="hoy-fila-asa"
        role="button"
        aria-label="Reordenar"
        onPointerDown={(e) => { e.stopPropagation(); controles.start(e) }}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={18} strokeWidth={1.75} />
      </span>
    </Reorder.Item>
  )
}
