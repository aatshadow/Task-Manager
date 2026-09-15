import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, ArchiveRestore, Eye, EyeOff, MessageSquare, Send, Sun, Trash2 } from 'lucide-react'
import Hoja from './Hoja.jsx'
import Marca from './Marca.jsx'
import Chip from './Chip.jsx'
import Campo from './Campo.jsx'
import Boton from './Boton.jsx'
import Selector from './Selector.jsx'
import { useDatos } from '../estado/useDatos.jsx'
import * as datosTareas from '../datos/tareas.js'
import { cargarTablerosDeCliente } from '../datos/catalogos.js'
import { textoFecha } from '../datos/fechas.js'

/**
 * La hoja de detalle: TODO lo que se puede hacer con una tarea (LOGICA §4), sea personal
 * o de GrowthInfo. Cada cambio guarda al instante: se pinta primero (optimista), se
 * escribe después y, si falla, se vuelve atrás y se avisa. La tarea que se pinta es
 * siempre la que devuelve la capa de datos (releída de la vista), nunca una inventada.
 *
 * Quién decide qué se puede tocar es `tarea.origen`:
 *   · portal → el cliente se ve pero no se cambia, categoría sólo las 7, etapas de SU
 *     tablero del portal, seguir, comentarios; se borra igual (eres dirección: la RLS manda);
 *   · hoy    → proyecto propio, cualquier categoría, etapas de su pipeline, borrar.
 */
export default function DetalleTarea() {
  const { tareaAbierta, tareaAbiertaId, cerrarTarea } = useDatos()

  // Mientras la hoja baja, `tareaAbierta` ya es null: se conserva la última para que la
  // animación de salida no enseñe una hoja vacía.
  const ultima = useRef(null)
  if (tareaAbierta) ultima.current = tareaAbierta
  const tarea = tareaAbierta || ultima.current
  const abierta = Boolean(tareaAbiertaId && tareaAbierta)

  return (
    <Hoja abierta={abierta} alCerrar={cerrarTarea}>
      {tarea && <Contenido key={tarea.id} tarea={tarea} />}
    </Hoja>
  )
}

const CATEGORIA_PORTAL_POR_DEFECTO = 'general'

function Contenido({ tarea: t }) {
  const {
    hoy, proyectos, proyectosTodos, clientes, equipo, categorias, categoriasTodas, pipelines, listaCuadrantes,
    nombreProyecto, nombrePersona, actualizarLocal, quitarLocal, recargar, avisar, cerrarTarea,
  } = useDatos()
  const esPortal = t.origen === 'portal'

  // Borradores de los campos de texto: se escriben al soltar el foco (no en cada tecla).
  const [titulo, setTitulo] = useState(t.titulo)
  const [descripcion, setDescripcion] = useState(t.descripcion || '')
  const [notas, setNotas] = useState(t.notas || '')
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  /**
   * El patrón de cada cambio: parche optimista en memoria → escritura → se sustituye por
   * lo releído → recarga de fondo. Si falla: se restaura lo de antes y se avisa.
   * `accion` devuelve la Tarea releída (o null si la tarea sale de la lista).
   */
  const guardar = async (parche, accion, { cerrar = false } = {}) => {
    const antes = t
    if (parche) actualizarLocal({ ...t, ...parche })
    setOcupado(true)
    try {
      const nueva = await accion()
      if (nueva) actualizarLocal(nueva)
      if (cerrar) cerrarTarea()
      recargar()
      return nueva
    } catch (e) {
      actualizarLocal(antes)
      avisar(e.message || 'No se pudo guardar', 'error')
      return null
    } finally {
      setOcupado(false)
    }
  }
  const editar = (cambios) => guardar(cambios, () => datosTareas.actualizar(t, cambios))
  // La capa no se relee por la vista: `capa()` ya devuelve la fila escrita, que es lo mismo.
  const editarCapa = (cambios) => guardar(cambios, async () => {
    const c = await datosTareas.capa(t.id, t.origen, cambios)
    return { ...t, cuadrante: c.cuadrante, hoyPara: c.hoyPara, orden: c.orden, horaInicio: c.horaInicio, horaFin: c.horaFin, seguida: c.seguida, notas: c.notas }
  })

  /* ── texto ─────────────────────────────────────────────────────────────── */
  const soltarTitulo = () => {
    const v = titulo.trim()
    if (!v) { setTitulo(t.titulo); return }
    if (v !== t.titulo) editar({ titulo: v })
  }
  const soltarDescripcion = () => { if (descripcion !== (t.descripcion || '')) editar({ descripcion }) }
  const soltarNotas = () => { if (notas !== (t.notas || '')) editarCapa({ notas }) }

  /* ── completar (los dos ejes, en la capa de datos) ─────────────────────── */
  const completar = (hecha) => guardar(datosTareas.parcheHecha(hecha), () => datosTareas.completar(t, hecha))

  /* ── proyecto / cliente ────────────────────────────────────────────────── */
  // Una personal no se convierte en una de GrowthInfo desde aquí (sería mover la fila de
  // tabla, y §4 dice `proyecto_id`): sólo proyectos propios. El de una del portal se ve.
  const opcionesProyecto = useMemo(() => proyectos.map((p) => ({ valor: p.id, etiqueta: `${p.icono ? `${p.icono} ` : ''}${p.nombre}` })), [proyectos])
  const proyectoActual = proyectosTodos.find((p) => p.id === t.proyectoId)
  const clienteActual = clientes.find((c) => c.id === t.clientId)

  /* ── categoría ─────────────────────────────────────────────────────────── */
  const opcionesCategoria = useMemo(() => {
    const base = esPortal ? categorias.filter((c) => c.delPortal) : categorias
    // Si la tarea lleva una categoría archivada, se enseña igual: que no parezca perdida.
    const actual = t.categoria && !base.some((c) => c.clave === t.categoria) ? categoriasTodas.find((c) => c.clave === t.categoria) : null
    return [...base, ...(actual ? [actual] : [])].map((c) => ({ valor: c.clave, etiqueta: c.nombre, color: c.color }))
  }, [categorias, categoriasTodas, esPortal, t.categoria])
  const cambiarCategoria = (clave) => editar({ categoria: esPortal ? (clave || CATEGORIA_PORTAL_POR_DEFECTO) : clave })

  /* ── cuadrante ─────────────────────────────────────────────────────────── */
  const opcionesCuadrante = useMemo(() => listaCuadrantes.map((q) => ({ valor: q.clave, etiqueta: q.nombre, color: q.color })), [listaCuadrantes])

  /* ── etapa: las de SU tablero ──────────────────────────────────────────── */
  const [etapasPortal, setEtapasPortal] = useState(null)
  useEffect(() => {
    if (!esPortal || !t.clientId) return
    let vivo = true
    cargarTablerosDeCliente(t.clientId)
      .then((ts) => {
        if (!vivo) return
        const tab = ts.find((x) => x.id === t.pipelineId) || ts.find((x) => x.esDefault) || ts[0] || null
        setEtapasPortal(tab?.etapas || [])
      })
      .catch((e) => { if (vivo) avisar(e.message, 'error') })
    return () => { vivo = false }
  }, [esPortal, t.clientId, t.pipelineId, avisar])
  const etapas = useMemo(() => {
    if (esPortal) return etapasPortal || []
    const pipe = pipelines.find((p) => p.id === t.pipelineId) || pipelines.find((p) => p.esDefault) || pipelines[0]
    return pipe?.etapas || []
  }, [esPortal, etapasPortal, pipelines, t.pipelineId])
  const opcionesEtapa = useMemo(() => etapas.map((e) => ({ valor: e.id, etiqueta: e.nombre, color: e.color })), [etapas])
  const moverA = (etapaId) => {
    const etapa = etapas.find((e) => e.id === etapaId)
    if (!etapa || etapa.id === t.etapaId) return
    const cambios = datosTareas.cambiosAlMover(etapa)
    guardar(cambios, () => datosTareas.mover(t, etapa))
  }

  /* ── responsable ───────────────────────────────────────────────────────── */
  const opcionesEquipo = useMemo(() => equipo.map((m) => ({ valor: m.id, etiqueta: m.rol ? `${m.nombre} · ${m.rol}` : m.nombre })), [equipo])

  /* ── Hoy ───────────────────────────────────────────────────────────────── */
  const enHoy = Boolean(t.hoyPara) && t.hoyPara <= hoy
  const alternarHoy = () => guardar({ hoyPara: enHoy ? null : hoy }, () => datosTareas.planificarHoy(t, enHoy ? null : hoy))

  /* ── seguir (solo portal) ──────────────────────────────────────────────── */
  const alternarSeguir = () => guardar({ seguida: !t.seguida }, () => datosTareas.seguir(t, !t.seguida))

  /* ── archivar / borrar ─────────────────────────────────────────────────── */
  const archivar = () => guardar(
    { archivadoEn: t.archivadoEn ? null : new Date().toISOString() },
    () => datosTareas.archivar(t, !t.archivadoEn),
    { cerrar: !t.archivadoEn },
  ).then((nueva) => { if (nueva?.archivadoEn) { quitarLocal(t.id); avisar('Archivada', 'ok') } })

  const borrar = async () => {
    setOcupado(true)
    try {
      await datosTareas.borrar(t)
      quitarLocal(t.id)
      cerrarTarea()
      avisar('Borrada', 'ok')
      recargar()
    } catch (e) {
      avisar(e.message || 'No se pudo borrar', 'error')
    } finally {
      setOcupado(false)
    }
  }

  /* ── comentarios (solo portal) ─────────────────────────────────────────── */
  const [comentarios, setComentarios] = useState(null)
  const [comentario, setComentario] = useState('')
  const [comentando, setComentando] = useState(false)
  useEffect(() => {
    if (!esPortal) return
    let vivo = true
    datosTareas.cargarComentarios(t.id)
      .then((cs) => { if (vivo) setComentarios(cs) })
      .catch((e) => { if (vivo) { setComentarios([]); avisar(e.message, 'error') } })
    return () => { vivo = false }
  }, [esPortal, t.id, avisar])
  const enviarComentario = async (e) => {
    e?.preventDefault()
    const texto = comentario.trim()
    if (!texto || comentando) return
    setComentando(true)
    try {
      const c = await datosTareas.comentar(t.id, texto)
      setComentarios((cs) => [...(cs || []), c])
      setComentario('')
    } catch (err) {
      avisar(err.message || 'No se pudo comentar', 'error')
    } finally {
      setComentando(false)
    }
  }

  const origenTexto = esPortal ? `GrowthInfo · ${clienteActual?.nombre || t.clientId}` : 'Personal'

  return (
    <div className="detalle" aria-busy={ocupado || undefined}>
      {/* cabecera: marca grande + título editable */}
      <div className="detalle-cabecera">
        <Marca grande hecha={t.hecha} alCambiar={completar} aria-label={t.hecha ? 'Reabrir' : 'Completar'} />
        <input
          className={`detalle-titulo ${t.hecha ? 'detalle-titulo--hecha' : ''}`}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onBlur={soltarTitulo}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          aria-label="Título"
          enterKeyHint="done"
        />
        {/* la papelera arriba: al final de la hoja nadie la encontraba (Alex, 16-09) */}
        <button type="button" className="detalle-papelera" onClick={() => setConfirmarBorrado(true)} disabled={ocupado} aria-label="Borrar tarea">
          <Trash2 size={18} strokeWidth={1.75} />
        </button>
      </div>
      {confirmarBorrado && (
        <div className="detalle-confirmar" role="alertdialog" aria-label="Confirmar borrado">
          <span>¿Borrar «{t.titulo}»?{esPortal ? ' Desaparece también del portal de GrowthInfo.' : ''} No se puede deshacer.</span>
          <div className="fila">
            <Boton variante="secundario" pequeno onClick={() => setConfirmarBorrado(false)} disabled={ocupado}>Cancelar</Boton>
            <Boton variante="primario" pequeno onClick={borrar} cargando={ocupado} className="boton--borrar">Sí, borrar</Boton>
          </div>
        </div>
      )}

      <div className="detalle-meta">
        <Chip color={esPortal ? 'var(--acento)' : 'var(--texto-2)'} pequeno>{origenTexto}</Chip>
        {t.archivadoEn && <Chip color="var(--texto-3)" pequeno>Archivada</Chip>}
        {esPortal && t.prioridadPortal && <Chip color="var(--texto-2)" pequeno punto={false}>prioridad {t.prioridadPortal}</Chip>}
        {esPortal && t.fase && <Chip color="var(--texto-2)" pequeno punto={false}>{t.fase}</Chip>}
        {t.vence && t.vence < hoy && !t.hecha && <Chip color="var(--peligro)" pequeno>Atrasada</Chip>}
      </div>

      {/* Hoy + seguir: los dos toggles que más se usan, arriba */}
      <div className="detalle-acciones-rapidas">
        <Chip color="var(--acento)" activo={enHoy} onClick={alternarHoy} punto={false} aria-label={enHoy ? 'Quitar de Hoy' : 'Poner en Hoy'}>
          <Sun size={14} strokeWidth={1.75} /> {enHoy ? 'En Hoy' : 'Hoy'}
        </Chip>
        {esPortal && (
          <Chip color="var(--acento)" activo={t.seguida} onClick={alternarSeguir} punto={false} aria-label={t.seguida ? 'Dejar de seguir' : 'Seguir'}>
            {t.seguida ? <Eye size={14} strokeWidth={1.75} /> : <EyeOff size={14} strokeWidth={1.75} />} {t.seguida ? 'Siguiendo' : 'Seguir'}
          </Chip>
        )}
      </div>

      <div className="detalle-campos">
        <Campo
          etiqueta="Descripción"
          multilinea
          placeholder="Sin descripción"
          valor={descripcion}
          alCambiar={setDescripcion}
          onBlur={soltarDescripcion}
        />

        {esPortal ? (
          <div className="campo">
            <div className="campo-etiqueta">Cliente</div>
            <div className="detalle-solo-lectura">
              <Chip color="var(--acento)">{clienteActual?.nombre || t.clientId}</Chip>
              <span className="t-terciario">no se cambia desde 2day</span>
            </div>
          </div>
        ) : (
          <Selector
            etiqueta="Proyecto"
            modo="desplegable"
            opciones={opcionesProyecto.some((o) => o.valor === t.proyectoId) || !proyectoActual ? opcionesProyecto : [...opcionesProyecto, { valor: proyectoActual.id, etiqueta: `${proyectoActual.nombre} · archivado` }]}
            valor={t.proyectoId}
            alCambiar={(id) => editar({ proyectoId: id || null })}
            placeholder="Sin proyecto"
            permitirVacio
          />
        )}

        <Selector
          etiqueta="Categoría"
          opciones={opcionesCategoria}
          valor={t.categoria}
          alCambiar={cambiarCategoria}
          permitirVacio={!esPortal}
        />

        <Selector
          etiqueta="Cuadrante"
          opciones={opcionesCuadrante}
          valor={t.cuadrante}
          alCambiar={(q) => editarCapa({ cuadrante: q || null })}
          permitirVacio
        />

        <div className="rejilla-2">
          <Campo etiqueta="Inicio" type="date" valor={t.inicio || ''} alCambiar={(v) => editar({ inicio: v || null })} />
          <Campo etiqueta="Vence" type="date" valor={t.vence || ''} alCambiar={(v) => editar({ vence: v || null })} />
        </div>

        <div className="rejilla-2">
          <Campo etiqueta="Desde" type="time" valor={t.horaInicio || ''} alCambiar={(v) => editarCapa({ horaInicio: v || null })} />
          <Campo etiqueta="Hasta" type="time" valor={t.horaFin || ''} alCambiar={(v) => editarCapa({ horaFin: v || null })} />
        </div>

        {opcionesEtapa.length > 0 && (
          <Selector etiqueta="Etapa" opciones={opcionesEtapa} valor={t.etapaId} alCambiar={moverA} />
        )}

        <Selector
          etiqueta="Responsable"
          modo="desplegable"
          opciones={opcionesEquipo}
          valor={t.responsableId}
          alCambiar={(id) => editar({ responsableId: id || null })}
          placeholder="Nadie"
          permitirVacio
        />

        <Campo
          etiqueta="Notas privadas"
          multilinea
          placeholder="Sólo las ves tú"
          valor={notas}
          alCambiar={setNotas}
          onBlur={soltarNotas}
        />
      </div>

      {esPortal && (
        <section className="detalle-comentarios">
          <div className="seccion-titulo fila"><MessageSquare size={14} strokeWidth={1.75} /> Comentarios del portal</div>
          {comentarios === null ? (
            <div className="t-terciario">Cargando…</div>
          ) : comentarios.length === 0 ? (
            <div className="t-terciario">Sin comentarios</div>
          ) : (
            <ul className="detalle-lista-comentarios">
              {comentarios.map((c) => (
                <li key={c.id} className="detalle-comentario">
                  <div className="detalle-comentario-cabeza">
                    <span>{nombrePersona(c.autorId) || 'Alguien'}</span>
                    <span className="t-terciario">{textoFecha(String(c.creadoEn).slice(0, 10))}</span>
                  </div>
                  <div className="detalle-comentario-texto">{c.texto}</div>
                </li>
              ))}
            </ul>
          )}
          <form className="detalle-comentar" onSubmit={enviarComentario}>
            <Campo placeholder="Escribe un comentario" valor={comentario} alCambiar={setComentario} enterKeyHint="send" />
            <Boton type="submit" icono={<Send size={18} strokeWidth={1.75} />} aria-label="Enviar comentario" cargando={comentando} disabled={!comentario.trim()} />
          </form>
        </section>
      )}

      <div className="detalle-pie">
        <div className="t-terciario">
          {nombreProyecto(t) ? `${nombreProyecto(t)} · ` : ''}creada {textoFecha(String(t.creadaEn).slice(0, 10))}
          {t.responsableId ? ` · ${nombrePersona(t.responsableId) || 'responsable'}` : ''}
        </div>
        <div className="detalle-peligrosas">
          <Boton
            variante="secundario"
            pequeno
            icono={t.archivadoEn ? <ArchiveRestore size={16} strokeWidth={1.75} /> : <Archive size={16} strokeWidth={1.75} />}
            onClick={archivar}
            disabled={ocupado}
          >
            {t.archivadoEn ? 'Desarchivar' : 'Archivar'}
          </Boton>
          {!confirmarBorrado && (
            <Boton variante="peligro" pequeno icono={<Trash2 size={16} strokeWidth={1.75} />} onClick={() => setConfirmarBorrado(true)} disabled={ocupado}>
              Borrar
            </Boton>
          )}
        </div>
      </div>
    </div>
  )
}
