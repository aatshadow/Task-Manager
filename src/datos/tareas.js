/**
 * tareas.js — la capa de datos de las tareas, vengan de donde vengan.
 *
 * MISMA FILA, DOS PUERTAS (LOGICA §1). Una tarea de GrowthInfo no se copia: se lee y se
 * escribe LA MISMA FILA de `public.tasks` que ve el portal. Lo que `tasks` no sabe
 * guardar de Alex (cuadrante, para qué día, orden, horas, «la sigo», notas) va en
 * `hoy_capa`. Una personal vive en `hoy_tareas` y también tiene su `hoy_capa`.
 *
 * Se LEE de una sola vista (`hoy_todas`) y se ESCRIBE en dos tablas según `origen`.
 * La traducción columna↔pantalla está en un sitio por tabla: `aTarea` (lectura, común
 * porque la vista ya unifica), `aColumnasHoy` y `aColumnasPortal` (escritura).
 *
 * ── DOS EJES QUE NO SON EL MISMO (regla heredada del portal, obligatoria) ─────
 *   · `etapa_id`/`stage_id` → en qué COLUMNA se pinta. Es de SU tablero.
 *   · `estado`/`status`     → qué SIGNIFICA. Vocabulario común.
 *   Mover escribe los dos en UNA escritura (`cambiosAlMover`), y `hecha`/`completed`
 *   sigue a la etapa terminal. Con dos llamadas, una que falle deja la tarjeta pintada
 *   en «Hecho» y contada como «Por hacer».
 */
import { supabase, isConfigured, ErrorHoy, filas, uno, ok, usuarioActual } from '../lib/supabase.js'
import {
  esEstado, categoriaPortal, esCuadrante, prioridadDeCuadrante,
  cargarPipelines, pipelinePorDefecto, cargarTablerosDeCliente, tableroPorDefectoDeCliente,
} from './catalogos.js'
import { diasEntre, horaCorta, hoyLocal, sumarDias } from './fechas.js'
import { esRegla, siguienteFecha } from './repetir.js'

export { ErrorHoy }

const listo = () => {
  if (!isConfigured || !supabase) throw new ErrorHoy('Supabase no está configurado')
}

/* ── LECTURA: la vista `hoy_todas` → vocabulario de pantalla ───────────────── */

const aTarea = (f) => ({
  id: f.id,
  origen: f.origen,                       // 'hoy' | 'portal'
  titulo: f.titulo,
  descripcion: f.descripcion || '',
  proyectoId: f.proyecto_id || null,      // personal
  clientId: f.client_id || null,          // portal
  categoria: f.categoria || null,
  pipelineId: f.pipeline_id || null,
  etapaId: f.etapa_id || null,
  estado: f.estado || 'todo',
  inicio: f.inicio || null,
  vence: f.vence || null,
  responsableId: f.responsable_id || null,
  participantes: f.participantes || [],
  hecha: !!f.hecha,
  hechaEn: f.hecha_en || null,
  archivadoEn: f.archivado_at || null,
  creadaEn: f.created_at,
  actualizadaEn: f.updated_at,
  posicion: Number(f.posicion) || 0,
  // la capa
  cuadrante: f.cuadrante || null,
  hoyPara: f.hoy_para || null,
  orden: Number(f.orden) || 0,
  horaInicio: horaCorta(f.hora_inicio),
  horaFin: horaCorta(f.hora_fin),
  seguida: !!f.seguida,
  notas: f.notas || '',
  repetir: esRegla(f.repetir) ? f.repetir : null,   // LOGICA §4.1
  // solo portal
  prioridadPortal: f.prioridad_portal || null,
  fase: f.fase || null,
})

/** Todas mis tareas (personales + las de GrowthInfo que me tocan), de la vista. */
export async function cargarTodas({ incluirArchivadas = false } = {}) {
  listo()
  let q = supabase.from('hoy_todas').select('*')
  if (!incluirArchivadas) q = q.is('archivado_at', null)
  const r = await q.order('orden').order('posicion').order('created_at')
  return filas(r, 'no se pudieron leer las tareas').map(aTarea)
}

/**
 * Explorar GrowthInfo: todas las tareas vivas con cliente que la RLS deje ver,
 * ordenadas por cliente, con su capa si la tienen (para saber si ya las sigo).
 * Salen de `tasks` y no de la vista porque la vista sólo trae «las mías».
 */
export async function cargarExplorar() {
  listo()
  const [ts, capas] = await Promise.all([
    supabase.from('tasks').select('*').is('archived_at', null).not('client_id', 'is', null)
      .order('client_id').order('position').order('created_at'),
    supabase.from('hoy_capa').select('*').eq('origen', 'portal'),
  ])
  const capaPor = new Map(filas(capas, 'no se pudo leer la capa').map((c) => [c.tarea_id, c]))
  return filas(ts, 'no se pudieron leer las tareas de GrowthInfo').map((k) => {
    const c = capaPor.get(k.id) || {}
    return aTarea({
      id: k.id, origen: 'portal', titulo: k.title, descripcion: k.description,
      proyecto_id: null, client_id: k.client_id, categoria: k.category,
      pipeline_id: k.pipeline_id, etapa_id: k.stage_id, estado: k.status,
      inicio: k.start_date, vence: k.due_date, responsable_id: k.assignee_id, participantes: k.assignees,
      hecha: k.completed, hecha_en: k.completed_at, archivado_at: k.archived_at,
      created_at: k.created_at, updated_at: k.updated_at, posicion: k.position,
      cuadrante: c.cuadrante, hoy_para: c.hoy_para, orden: c.orden, hora_inicio: c.hora_inicio, hora_fin: c.hora_fin,
      seguida: c.seguida, notas: c.notas, repetir: c.repetir, prioridad_portal: k.priority, fase: k.fase,
    })
  })
}

/* ── ESCRITURA: vocabulario de pantalla → columnas, una tabla cada uno ─────── */

const aColumnasHoy = (c) => {
  const m = {}
  if ('titulo' in c) m.titulo = String(c.titulo || '').trim()
  if ('descripcion' in c) m.descripcion = c.descripcion || ''
  if ('proyectoId' in c) m.proyecto_id = c.proyectoId || null
  if ('categoria' in c) m.categoria = c.categoria || null
  if ('pipelineId' in c) m.pipeline_id = c.pipelineId || null
  if ('etapaId' in c) m.etapa_id = c.etapaId || null
  if ('estado' in c) m.estado = c.estado
  if ('inicio' in c) m.inicio = c.inicio || null
  if ('vence' in c) m.vence = c.vence || null
  if ('responsableId' in c) m.responsable_id = c.responsableId || null
  if ('hecha' in c) m.hecha = !!c.hecha
  if ('posicion' in c) m.posicion = c.posicion
  if ('archivadoEn' in c) m.archivado_at = c.archivadoEn
  return m
}

const aColumnasPortal = (c) => {
  const m = {}
  if ('titulo' in c) m.title = String(c.titulo || '').trim()
  if ('descripcion' in c) m.description = c.descripcion || ''
  // Una del portal sólo admite las 7 (check de `tasks.category`): lo que no case cae en general.
  if ('categoria' in c) m.category = categoriaPortal(c.categoria)
  if ('pipelineId' in c) m.pipeline_id = c.pipelineId || null
  if ('etapaId' in c) m.stage_id = c.etapaId || null
  if ('estado' in c) m.status = c.estado
  if ('inicio' in c) m.start_date = c.inicio || null
  if ('vence' in c) m.due_date = c.vence || null
  if ('responsableId' in c) m.assignee_id = c.responsableId || null
  if ('hecha' in c) m.completed = !!c.hecha
  if ('posicion' in c) m.position = c.posicion
  if ('archivadoEn' in c) m.archived_at = c.archivadoEn
  if ('prioridadPortal' in c) m.priority = c.prioridadPortal
  if ('fase' in c) m.fase = c.fase || null
  return m
}

const aColumnasCapa = (c) => {
  const m = {}
  if ('cuadrante' in c) m.cuadrante = esCuadrante(c.cuadrante) ? c.cuadrante : null
  if ('hoyPara' in c) m.hoy_para = c.hoyPara || null
  if ('orden' in c) m.orden = c.orden ?? 0
  if ('horaInicio' in c) m.hora_inicio = c.horaInicio || null
  if ('horaFin' in c) m.hora_fin = c.horaFin || null
  if ('seguida' in c) m.seguida = !!c.seguida
  if ('notas' in c) m.notas = c.notas || ''
  if ('repetir' in c) m.repetir = esRegla(c.repetir) ? c.repetir : null
  return m
}

const tabla = (t) => (t.origen === 'portal' ? 'tasks' : 'hoy_tareas')
const traducir = (t, cambios) => (t.origen === 'portal' ? aColumnasPortal(cambios) : aColumnasHoy(cambios))

/** Última posición de una columna + 1 (en la tabla que toque). */
async function ultimaPosicion(origen, etapaId) {
  const esPortal = origen === 'portal'
  let q = supabase.from(esPortal ? 'tasks' : 'hoy_tareas').select(esPortal ? 'position' : 'posicion')
  q = etapaId ? q.eq(esPortal ? 'stage_id' : 'etapa_id', etapaId) : q.is(esPortal ? 'stage_id' : 'etapa_id', null)
  const f = filas(await q.order(esPortal ? 'position' : 'posicion', { ascending: false }).limit(1), 'no se pudo leer la posición')
  return f.length ? (Number(f[0][esPortal ? 'position' : 'posicion']) || 0) + 1 : 1
}

/**
 * Crea una tarea. `origen: 'hoy'` → `hoy_tareas`; `origen: 'portal'` (con `clientId`) →
 * `tasks`. Siempre nace su fila de `hoy_capa`.
 *
 * En `tasks` se escribe lo que el portal necesita para verla como suya: tablero por
 * defecto del cliente, etapa `todo`, prioridad traducida del cuadrante (una vez),
 * categoría de las 7, `visibilidad` interna, `created_by` yo. `seguida = true` para
 * que siga entrando en la vista aunque después la asignen a otro.
 */
export async function crear(datos = {}) {
  listo()
  const titulo = String(datos.titulo || '').trim()
  if (!titulo) throw new ErrorHoy('una tarea necesita título')
  const origen = datos.origen === 'portal' || (!datos.origen && datos.clientId) ? 'portal' : 'hoy'
  const cuadrante = esCuadrante(datos.cuadrante) ? datos.cuadrante : null
  let fila

  if (origen === 'portal') {
    if (!datos.clientId) throw new ErrorHoy('una tarea de GrowthInfo necesita cliente')
    const usuario = await usuarioActual()
    const tablero = await tableroPorDefectoDeCliente(datos.clientId)
    if (!tablero) throw new ErrorHoy(`el cliente ${datos.clientId} no tiene tablero en el portal`)
    const etapaTodo = tablero.etapas.find((e) => e.clave === 'todo') || tablero.etapas[0] || null
    const r = await supabase.from('tasks').insert({
      client_id: datos.clientId,
      pipeline_id: tablero.id,
      stage_id: etapaTodo?.id || null,
      title: titulo,
      description: datos.descripcion || '',
      status: 'todo',
      priority: prioridadDeCuadrante(cuadrante),
      category: categoriaPortal(datos.categoria),
      visibilidad: 'interna',
      created_by: usuario.id,
      assignee_id: datos.responsableId || null,
      start_date: datos.inicio || null,
      due_date: datos.vence || null,
      fase: datos.fase || null,
      position: await ultimaPosicion('portal', etapaTodo?.id || null),
    }).select().single()
    fila = uno(r, 'no se pudo crear la tarea en GrowthInfo')
  } else {
    const pipe = datos.pipelineId
      ? (await cargarPipelines()).find((p) => p.id === datos.pipelineId) || (await pipelinePorDefecto())
      : await pipelinePorDefecto()
    const etapaTodo = pipe?.etapas.find((e) => e.clave === 'todo') || pipe?.etapas[0] || null
    const r = await supabase.from('hoy_tareas').insert({
      titulo,
      descripcion: datos.descripcion || '',
      proyecto_id: datos.proyectoId || null,
      categoria: datos.categoria || null,
      pipeline_id: pipe?.id || null,
      etapa_id: etapaTodo?.id || null,
      estado: 'todo',
      inicio: datos.inicio || null,
      vence: datos.vence || null,
      responsable_id: datos.responsableId || null,
      posicion: await ultimaPosicion('hoy', etapaTodo?.id || null),
    }).select().single()
    fila = uno(r, 'no se pudo crear la tarea')
  }

  // DESPUÉS de la tarea, su capa: si esto falla la tarea ya existe y se ve (sin capa
  // la vista la trae igual, con la capa a cero). Al revés dejaría una capa huérfana.
  await capa(fila.id, origen, {
    cuadrante, hoyPara: datos.hoyPara || null, orden: datos.orden ?? 0,
    horaInicio: datos.horaInicio || null, horaFin: datos.horaFin || null,
    seguida: origen === 'portal', notas: datos.notas || '',
    repetir: esRegla(datos.repetir) ? datos.repetir : null,
  })
  return releer(fila.id, origen)
}

/** Relee una tarea por la vista (para devolver exactamente lo que verá la pantalla). */
async function releer(id, origen) {
  const r = await supabase.from('hoy_todas').select('*').eq('id', id).eq('origen', origen).maybeSingle()
  const f = uno(r, 'no se pudo releer la tarea')
  if (f) return aTarea(f)
  // Una del portal que no me toca (ni asignada ni seguida ni creada por mí) no está en
  // la vista. No se inventa: se dice.
  throw new ErrorHoy('la tarea no aparece en la vista hoy_todas')
}

/** Edita campos de la tarea (no de la capa). Decide tabla por `tarea.origen`. */
export async function actualizar(tarea, cambios = {}) {
  listo()
  if (!tarea?.id) throw new ErrorHoy('falta la tarea')
  const m = traducir(tarea, cambios)
  if (!Object.keys(m).length) return tarea
  ok(await supabase.from(tabla(tarea)).update(m).eq('id', tarea.id), 'no se pudo guardar el cambio')
  return releer(tarea.id, tarea.origen)
}

/**
 * QUÉ CAMBIA AL MOVER. Puro: entra la etapa destino, sale lo que hay que escribir, en
 * vocabulario de pantalla (vale para las dos tablas). Copia de la lógica de
 * `cambiosAlMover()` del portal:
 *   · la etapa manda en dónde se ve;
 *   · si su clave es del vocabulario común, el estado la sigue; si es una columna propia,
 *     el estado NO se inventa (se queda como estaba);
 *   · `hecha` = etapa terminal. Sin etapa (`null` = «sin columna») y sin estado conocido,
 *     `hecha` no se toca: sacar a «sin columna» no des-termina.
 * `estadoPedido` sirve cuando se suelta sobre un ESTADO y no sobre una columna.
 */
export function cambiosAlMover(etapa, estadoPedido = null) {
  const clave = etapa ? etapa.clave : estadoPedido
  const delVocabulario = esEstado(clave)
  return {
    etapaId: etapa ? etapa.id : null,
    ...(etapa?.pipelineId ? { pipelineId: etapa.pipelineId } : {}),
    ...(delVocabulario ? { estado: clave } : {}),
    ...(etapa ? { hecha: !!etapa.esTerminal } : delVocabulario ? { hecha: clave === 'done' } : {}),
  }
}

/**
 * Mueve la tarea a una etapa: `stage_id`+`status`+`completed` (o `etapa_id`+`estado`+`hecha`)
 * en UNA escritura. `etapa` viene de `cargarPipelines()` (personal) o de
 * `cargarTablerosDeCliente()` (portal): `{ id, clave, pipelineId, esTerminal }`.
 * `posicion` opcional: si se da, también se escribe (para soltar al final de la columna).
 */
export async function mover(tarea, etapa, { posicion, estadoPedido = null } = {}) {
  listo()
  if (!tarea?.id) throw new ErrorHoy('falta la tarea')
  const cambios = cambiosAlMover(etapa, estadoPedido)
  if (posicion != null) cambios.posicion = posicion
  const m = traducir(tarea, cambios)
  ok(await supabase.from(tabla(tarea)).update(m).eq('id', tarea.id), 'no se pudo mover la tarea')
  const nueva = await releer(tarea.id, tarea.origen)
  // Se repite y acaba de pasar a hecha (por la puerta que sea: marca, hoja, kanban): nace la
  // siguiente (LOGICA §4.1). Si engendrar falla, la tarea ya está hecha: se avisa, no se deshace.
  if (nueva.hecha && !tarea.hecha && nueva.repetir) await engendrarSiguiente(nueva)
  return nueva
}

/* ── REPETIR (LOGICA §4.1) ─────────────────────────────────────────────────── */

/** `vence` de la siguiente ocurrencia de `t`, o null si no se repite. */
export function siguienteDe(t, hoy = hoyLocal()) {
  if (!t?.repetir) return null
  const ancla = t.vence || hoy
  return siguienteFecha(t.repetir, ancla, ancla > hoy ? ancla : hoy)
}

/**
 * Crea la siguiente ocurrencia: la misma tarea con `vence` en la siguiente fecha de la serie
 * y planificada para ese día. Sin duplicar: si ya hay una viva igual (título, regla y vence),
 * es que ya nació (des-completar y volver a completar no engendra dos).
 */
async function engendrarSiguiente(t) {
  const vence = siguienteDe(t)
  if (!vence) return null
  const ya = await supabase.from('hoy_todas').select('id')
    .eq('titulo', t.titulo).eq('repetir', t.repetir).eq('vence', vence).eq('hecha', false).is('archivado_at', null).limit(1)
  if (filas(ya, 'no se pudo comprobar la siguiente ocurrencia').length) return null
  return crear({
    titulo: t.titulo,
    descripcion: t.descripcion,
    origen: t.origen,
    proyectoId: t.proyectoId,
    clientId: t.clientId,
    categoria: t.categoria,
    pipelineId: t.origen === 'hoy' ? t.pipelineId : undefined,
    responsableId: t.responsableId,
    fase: t.fase,
    cuadrante: t.cuadrante,
    // un período se desplaza entero, como al mover de día en el calendario
    inicio: t.inicio && t.vence ? sumarDias(t.inicio, diasEntre(t.vence, vence)) : null,
    vence,
    hoyPara: vence,
    horaInicio: t.horaInicio,
    horaFin: t.horaFin,
    repetir: t.repetir,
  })
}

/** Salta a la siguiente fecha de la serie SIN completar: es la misma tarea, movida (§4.1.4). */
export async function saltar(tarea) {
  listo()
  const vence = siguienteDe(tarea)
  if (!vence) throw new ErrorHoy('esta tarea no se repite')
  const cambios = { vence }
  if (tarea.inicio && tarea.vence) cambios.inicio = sumarDias(tarea.inicio, diasEntre(tarea.vence, vence))
  await actualizar(tarea, cambios)
  await capa(tarea.id, tarea.origen, { hoyPara: vence })
  return releer(tarea.id, tarea.origen)
}

/** El tablero de la tarea: el suyo por id, o el por defecto de su cliente/mío. */
async function tableroDe(tarea) {
  if (tarea.origen === 'portal') {
    const ts = tarea.clientId ? await cargarTablerosDeCliente(tarea.clientId) : []
    return ts.find((t) => t.id === tarea.pipelineId) || ts.find((t) => t.esDefault) || ts[0] || null
  }
  const ps = await cargarPipelines()
  return ps.find((p) => p.id === tarea.pipelineId) || (await pipelinePorDefecto())
}

/**
 * Completar = mover a la etapa `done` de SU tablero (y des-completar = a `todo`). Así
 * los dos ejes quedan de acuerdo en la misma escritura. Si el tablero no tiene esa
 * etapa, se escribe el estado sin columna (`estadoPedido`), que es lo que hace el
 * portal en la vista de toda la cartera.
 */
/** Lo que la pantalla pinta al instante al completar, antes de que la base conteste. */
export const parcheHecha = (hecha) => ({ hecha, estado: hecha ? 'done' : 'todo', hechaEn: hecha ? new Date().toISOString() : null })

export async function completar(tarea, hecha = true) {
  listo()
  const clave = hecha ? 'done' : 'todo'
  const tab = await tableroDe(tarea)
  const etapa = tab?.etapas.find((e) => e.clave === clave)
    || (hecha ? tab?.etapas.find((e) => e.esTerminal) : tab?.etapas.find((e) => !e.esTerminal))
    || null
  return mover(tarea, etapa, { estadoPedido: etapa ? null : clave })
}

/* ── LA CAPA ───────────────────────────────────────────────────────────────── */

const aCapa = (c) => ({
  tareaId: c.tarea_id, origen: c.origen, cuadrante: c.cuadrante || null, hoyPara: c.hoy_para || null,
  orden: Number(c.orden) || 0, horaInicio: horaCorta(c.hora_inicio), horaFin: horaCorta(c.hora_fin),
  seguida: !!c.seguida, notas: c.notas || '', repetir: esRegla(c.repetir) ? c.repetir : null, actualizadaEn: c.updated_at,
})

/** Upsert de la capa personal de cualquier tarea (`onConflict: tarea_id`). */
export async function capa(tareaId, origen, cambios = {}) {
  listo()
  if (!tareaId) throw new ErrorHoy('falta la tarea')
  if (origen !== 'hoy' && origen !== 'portal') throw new ErrorHoy(`origen desconocido: ${origen}`)
  const fila = { tarea_id: tareaId, origen, ...aColumnasCapa(cambios) }
  const r = await supabase.from('hoy_capa').upsert(fila, { onConflict: 'tarea_id' }).select().single()
  return aCapa(uno(r, 'no se pudo guardar la capa'))
}

/**
 * Planificar para un día (o quitar el día con `null`). `orden` es opcional: la pantalla de
 * Hoy lo manda (último + 1) para que la tarea recién traída caiga AL FINAL de la lista y
 * no se cuele arriba con el orden 0 por defecto, desplazando a la destacada.
 */
export async function planificarHoy(tarea, fecha = null, { orden } = {}) {
  const cambios = { hoyPara: fecha || null }
  if (orden !== undefined) cambios.orden = orden
  await capa(tarea.id, tarea.origen, cambios)
  return releer(tarea.id, tarea.origen)
}

/**
 * La hora del día (capa personal): `horaInicio`/`horaFin` como 'HH:MM' o null. Sólo se
 * escribe lo que viene; `undefined` no toca la columna. Es lo que escribe el arrastre del
 * calendario (LOGICA §5.1) y podría escribir cualquiera.
 */
export async function programar(tarea, { horaInicio, horaFin } = {}) {
  const cambios = {}
  if (horaInicio !== undefined) cambios.horaInicio = horaInicio || null
  if (horaFin !== undefined) cambios.horaFin = horaFin || null
  await capa(tarea.id, tarea.origen, cambios)
  return releer(tarea.id, tarea.origen)
}

export async function seguir(tarea, si = true) {
  await capa(tarea.id, tarea.origen, { seguida: !!si })
  // Al dejar de seguir una que no me toca, sale de la vista: releer no la encontraría.
  const r = await supabase.from('hoy_todas').select('*').eq('id', tarea.id).eq('origen', tarea.origen).maybeSingle()
  const f = uno(r, 'no se pudo releer la tarea')
  return f ? aTarea(f) : { ...tarea, seguida: !!si }
}

export async function archivar(tarea, si = true) {
  return actualizar(tarea, { archivadoEn: si ? new Date().toISOString() : null })
}

/**
 * Borrar, sea personal o de GrowthInfo (Alex, 16-09: «no puedo eliminar tareas. Déjame»).
 * En `tasks` borrar es de dirección (`p_tasks_del` = `is_agency()`), y Alex lo es: la RLS
 * es la que decide, no esta función. Si la política dijera que no, el delete no toca filas
 * y aquí se dice en vez de fingir que se borró.
 */
export async function borrar(tarea) {
  listo()
  if (!tarea?.id) throw new ErrorHoy('falta la tarea')
  const r = await supabase.from(tabla(tarea)).delete().eq('id', tarea.id).select('id')
  const filas = uno(r, 'no se pudo borrar la tarea')
  if (!filas?.length) throw new ErrorHoy('la tarea no se borró: no tienes permiso en el portal')
  // La capa no tiene FK (apunta a dos tablas): se limpia a mano.
  ok(await supabase.from('hoy_capa').delete().eq('tarea_id', tarea.id), 'no se pudo borrar la capa')
  return true
}

/* ── EL DÍA ────────────────────────────────────────────────────────────────── */

const aDia = (d) => ({
  fecha: d.fecha, planificadas: d.planificadas || 0, hechas: d.hechas || 0, nota: d.nota || '', cerradoEn: d.cerrado_en,
})

/** Cierra los días anteriores a `hoy` (RPC). Devuelve los días cerrados en esta pasada. */
export async function reiniciarDia(hoy) {
  listo()
  const { data, error } = await supabase.rpc('hoy_reiniciar_dia', { p_hoy: hoy })
  if (error) throw new ErrorHoy('no se pudo reiniciar el día', error)
  return (data || []).map(aDia)
}

export async function cargarDias(desde, hasta) {
  listo()
  let q = supabase.from('hoy_dias').select('*').order('fecha')
  if (desde) q = q.gte('fecha', desde)
  if (hasta) q = q.lte('fecha', hasta)
  return filas(await q, 'no se pudieron leer los días').map(aDia)
}

export async function anotarDia(fecha, nota) {
  listo()
  const r = await supabase.from('hoy_dias').update({ nota: nota || '' }).eq('fecha', fecha).select().single()
  return aDia(uno(r, 'no se pudo anotar el día'))
}

/* ── COMENTARIOS (solo portal) ─────────────────────────────────────────────── */

const aComentario = (c) => ({ id: c.id, taskId: c.task_id, autorId: c.author_id, texto: c.body, creadoEn: c.created_at })

export async function cargarComentarios(taskId) {
  listo()
  if (!taskId) return []
  const r = await supabase.from('task_comments').select('*').eq('task_id', taskId).order('created_at')
  return filas(r, 'no se pudieron leer los comentarios').map(aComentario)
}

export async function comentar(taskId, texto) {
  listo()
  const t = String(texto || '').trim()
  if (!taskId || !t) throw new ErrorHoy('un comentario necesita texto')
  const usuario = await usuarioActual()
  const r = await supabase.from('task_comments').insert({ task_id: taskId, body: t, author_id: usuario.id }).select().single()
  return aComentario(uno(r, 'no se pudo comentar'))
}

/* ── DERIVADAS (puras): nunca un estado, siempre una pregunta ──────────────── */

/** Atrasada = vence antes de hoy y no está hecha. Derivada, no estado (LOGICA §3.5). */
export const esAtrasada = (t, hoy) => !!t.vence && !t.hecha && !t.archivadoEn && t.vence < hoy

/** Bandeja = sin triar: sin proyecto/cliente y sin cuadrante, viva y no hecha. */
export const esBandeja = (t) => !t.hecha && !t.archivadoEn && !t.proyectoId && !t.clientId && !t.cuadrante

/** Días que lleva en bandeja; con `ajustes` dice si ya «se enciende». */
// Nunca negativo: una tarea creada a la 01:00 del 16 cuando «hoy» sigue siendo el 15 (hora
// de reinicio 04:00) daría «hace -1 días». Se creó hoy, y punto.
export const diasEnBandeja = (t, hoy) => (t.creadaEn ? Math.max(0, diasEntre(t.creadaEn, hoy)) : 0)
export const bandejaEncendida = (t, ajustes, hoy) => esBandeja(t) && diasEnBandeja(t, hoy) > (ajustes?.diasBandeja ?? 7)

/** Nevera = sin tocar `diasNevera` días, sin fecha y sin estar en Hoy. Derivada de `updated_at`. */
export const esNevera = (t, ajustes, hoy) =>
  !t.hecha && !t.archivadoEn && !t.vence && !t.hoyPara
  && diasEntre(t.actualizadaEn || t.creadaEn, hoy) >= (ajustes?.diasNevera ?? 30)

/** En Hoy = planificada para el día `hoy` (o antes y aún sin cerrar). */
export const esDeHoy = (t, hoy) => !!t.hoyPara && !t.archivadoEn && t.hoyPara <= hoy

/** Viva = ni hecha ni archivada. */
export const esViva = (t) => !t.hecha && !t.archivadoEn
