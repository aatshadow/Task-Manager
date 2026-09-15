/**
 * plantillas.js — plantillas propias (`hoy_plantillas` + ítems) y las de la agencia
 * (`task_templates`, sólo lectura). Instanciar = plantilla + proyecto (propio o cliente)
 * + fecha base opcional → nacen todos los ítems por `tareas.crear()`, así una plantilla
 * que apunta a un cliente nace en `tasks` con las mismas reglas que una tarea suelta.
 */
import { supabase, isConfigured, ErrorHoy, filas, uno, ok } from '../lib/supabase.js'
import { cuadranteDePrioridad, esCuadrante } from './catalogos.js'
import { sumarDias } from './fechas.js'
import { crear } from './tareas.js'

const listo = () => {
  if (!isConfigured || !supabase) throw new ErrorHoy('Supabase no está configurado')
}

const aItem = (i) => ({
  id: i.id, titulo: i.titulo, descripcion: i.descripcion || '', categoria: i.categoria || null,
  cuadrante: i.cuadrante || null, grupo: i.grupo || null, diasOffset: i.dias_offset || 0, posicion: i.posicion || 0,
})
const aPlantilla = (p) => ({
  id: p.id, origen: 'hoy', soloLectura: false, nombre: p.nombre, descripcion: p.descripcion || '',
  creadaEn: p.created_at, actualizadaEn: p.updated_at,
  items: (p.hoy_plantilla_items || []).map(aItem).sort((a, b) => a.posicion - b.posicion),
})
// Las de la agencia se leen con la misma forma: la prioridad se enseña como cuadrante
// (inversa de la traducción de crear) y la `fase` como grupo. Sin fechas: no las tienen.
const aPlantillaAgencia = (t) => ({
  id: t.id, origen: 'agencia', soloLectura: true, nombre: t.name, descripcion: t.descripcion || '',
  creadaEn: t.created_at, actualizadaEn: null,
  items: (t.task_template_items || [])
    .sort((a, b) => a.position - b.position)
    .map((i) => ({
      id: i.id, titulo: i.title, descripcion: i.description || '', categoria: i.category || 'general',
      cuadrante: cuadranteDePrioridad(i.priority), grupo: i.fase || null, diasOffset: 0, posicion: i.position || 0,
    })),
})

/** Propias + de la agencia, en esa orden. */
export async function cargarPlantillas() {
  listo()
  const [mias, agencia] = await Promise.all([
    supabase.from('hoy_plantillas').select('*, hoy_plantilla_items(*)').order('created_at'),
    supabase.from('task_templates').select('id, key, name, descripcion, orden, created_at, task_template_items(id, title, description, fase, category, priority, position)').order('orden'),
  ])
  return [
    ...filas(mias, 'no se pudieron leer las plantillas').map(aPlantilla),
    ...filas(agencia, 'no se pudieron leer las plantillas de la agencia').map(aPlantillaAgencia),
  ]
}

export async function crearPlantilla({ nombre, descripcion = '' }) {
  listo()
  const n = String(nombre || '').trim()
  if (!n) throw new ErrorHoy('una plantilla necesita nombre')
  const r = await supabase.from('hoy_plantillas').insert({ nombre: n, descripcion: descripcion || '' }).select('*, hoy_plantilla_items(*)').single()
  return aPlantilla(uno(r, 'no se pudo crear la plantilla'))
}

export async function actualizarPlantilla(id, cambios) {
  listo()
  const m = {}
  if ('nombre' in cambios) m.nombre = String(cambios.nombre || '').trim()
  if ('descripcion' in cambios) m.descripcion = cambios.descripcion || ''
  if (!Object.keys(m).length) return null
  const r = await supabase.from('hoy_plantillas').update(m).eq('id', id).select('*, hoy_plantilla_items(*)').single()
  return aPlantilla(uno(r, 'no se pudo guardar la plantilla'))
}

/** Borrar una plantilla propia (los ítems caen en cascada). Las de la agencia no se tocan. */
export async function borrarPlantilla(id) {
  listo()
  ok(await supabase.from('hoy_plantillas').delete().eq('id', id), 'no se pudo borrar la plantilla')
  return true
}

/**
 * Guarda la lista COMPLETA de ítems: los que traen id se actualizan, los que no nacen,
 * y los que ya no están se borran. La posición es el índice en la lista. Lo devuelto
 * viene en el mismo orden que lo mandado (sin los de título vacío), así quien llama
 * puede casar un ítem nuevo con su fila por posición.
 */
export async function guardarItems(plantillaId, items = []) {
  listo()
  if (!plantillaId) throw new ErrorHoy('falta la plantilla')
  const actuales = filas(await supabase.from('hoy_plantilla_items').select('id').eq('plantilla_id', plantillaId))
  const vivos = new Set(items.map((i) => i.id).filter(Boolean))
  const sobran = actuales.map((a) => a.id).filter((id) => !vivos.has(id))
  if (sobran.length) ok(await supabase.from('hoy_plantilla_items').delete().in('id', sobran), 'no se pudieron borrar ítems')
  const filasNuevas = items
    .map((i, idx) => ({
      ...(i.id ? { id: i.id } : {}),
      plantilla_id: plantillaId,
      titulo: String(i.titulo || '').trim(),
      descripcion: i.descripcion || '',
      categoria: i.categoria || null,
      cuadrante: esCuadrante(i.cuadrante) ? i.cuadrante : null,
      grupo: i.grupo || null,
      dias_offset: Number(i.diasOffset) || 0,
      posicion: idx,
    }))
    .filter((f) => f.titulo)
  if (!filasNuevas.length) return []
  // `defaultToNull: false` (Prefer: missing=default): en una tanda con filas con id y
  // sin id, el id ausente lo rellena el DEFAULT de la tabla en vez de null. Así la
  // pantalla no tiene que inventar ids (crypto.randomUUID sólo existe en HTTPS/localhost).
  const r = await supabase.from('hoy_plantilla_items').upsert(filasNuevas, { onConflict: 'id', defaultToNull: false }).select()
  return filas(r, 'no se pudieron guardar los ítems').map(aItem).sort((a, b) => a.posicion - b.posicion)
}

/**
 * Instancia una plantilla en un proyecto propio o en un cliente de GrowthInfo. Con
 * `fechaBase`, cada ítem vence en `fechaBase + diasOffset`; sin ella, sin fecha (no se
 * inventa un calendario). En secuencia, no en paralelo: así la posición respeta el orden.
 */
export async function instanciar(plantilla, { proyectoId = null, clientId = null, fechaBase = null } = {}) {
  listo()
  if (!plantilla?.items?.length) return []
  const creadas = []
  for (const i of plantilla.items) {
    creadas.push(await crear({
      titulo: i.titulo,
      descripcion: i.descripcion || '',
      origen: clientId ? 'portal' : 'hoy',
      clientId: clientId || null,
      proyectoId: clientId ? null : proyectoId || null,
      categoria: i.categoria || null,
      cuadrante: i.cuadrante || null,
      vence: fechaBase ? sumarDias(fechaBase, i.diasOffset || 0) : null,
      fase: i.grupo || null,
    }))
  }
  return creadas
}
