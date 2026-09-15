/**
 * e2e-alex.mjs — el recorrido de LOGICA §8, con login real (cuenta del vault, nunca en
 * el repo) y a través de la CAPA DE DATOS (`src/datos/*`), no de consultas sueltas:
 *   1. crea una tarea personal;
 *   2. crea una de GrowthInfo en el cliente `kiki`;
 *   3. la mueve a `done` y comprueba en `tasks` que `stage_id` es la etapa `done` del
 *      tablero de kiki Y `status = 'done'` Y `completed = true` (los dos ejes, una escritura);
 *   4. la sigue / desigue; la archiva;
 *   5. limpia TODO lo creado, también en `tasks` (borra con la sesión si la RLS lo
 *      permite; si no, archiva con título `2day·prueba·<ts>` y lo dice).
 * `node tests/e2e-alex.mjs`.
 */
import assert from 'node:assert/strict'
import { entrar, paso, ok, ko, cerrar } from './_comun.mjs'
import * as catalogos from '../src/datos/catalogos.js'
import * as tareas from '../src/datos/tareas.js'
import * as habitos from '../src/datos/habitos.js'
import * as plantillas from '../src/datos/plantillas.js'
import { hoyLocal, sumarDias } from '../src/datos/fechas.js'

console.log('e2e-alex.mjs — el recorrido de §8\n')

const TS = Date.now()
const MARCA = `2day·prueba·${TS}`
const creado = { personales: [], portal: [], habitos: [], plantillas: [] }

const { sb, usuario } = await entrar()
ok(`login como ${usuario.email}`)
await catalogos.sembrar()
const ajustes = await catalogos.cargarAjustes()
const hoy = hoyLocal(ajustes.horaReinicio)

try {
  /* ── 1 · personal ────────────────────────────────────────────────────────── */
  const principal = await catalogos.pipelinePorDefecto()
  const etTodo = principal.etapas.find((e) => e.clave === 'todo')
  const etDone = principal.etapas.find((e) => e.clave === 'done')

  const p = await tareas.crear({ titulo: `${MARCA} personal`, origen: 'hoy', cuadrante: 'q2', hoyPara: hoy, vence: sumarDias(hoy, 2), categoria: 'ia' })
  creado.personales.push(p.id)
  assert.equal(p.origen, 'hoy')
  assert.equal(p.etapaId, etTodo.id, 'nace en la etapa todo del Principal')
  assert.equal(p.estado, 'todo')
  assert.equal(p.cuadrante, 'q2'); assert.equal(p.hoyPara, hoy); assert.equal(p.hecha, false)
  ok('personal: nace en hoy_tareas + hoy_capa (cuadrante q2, planificada para hoy)')

  const pAct = await tareas.actualizar(p, { titulo: `${MARCA} personal editada`, descripcion: 'desc' })
  assert.equal(pAct.titulo, `${MARCA} personal editada`)
  const pHecha = await tareas.completar(pAct)
  assert.equal(pHecha.etapaId, etDone.id, 'completar = etapa done')
  assert.equal(pHecha.estado, 'done'); assert.equal(pHecha.hecha, true); assert.ok(pHecha.hechaEn, 'hecha_en la pone el trigger')
  const pAbierta = await tareas.completar(pHecha, false)
  assert.equal(pAbierta.etapaId, etTodo.id); assert.equal(pAbierta.estado, 'todo'); assert.equal(pAbierta.hecha, false); assert.equal(pAbierta.hechaEn, null)
  ok('personal: completar y reabrir escriben etapa_id + estado + hecha de acuerdo')

  const etCurso = principal.etapas.find((e) => e.clave === 'in_progress')
  const pCurso = await tareas.mover(pAbierta, etCurso, { posicion: 7 })
  assert.equal(pCurso.etapaId, etCurso.id); assert.equal(pCurso.estado, 'in_progress'); assert.equal(pCurso.posicion, 7)
  ok('personal: mover a «En curso» arrastra el estado')

  const enVista = (await tareas.cargarTodas()).find((t) => t.id === p.id)
  assert.ok(enVista, 'está en hoy_todas'); assert.equal(enVista.origen, 'hoy')
  ok('personal: se ve por la vista')

  /* ── 2 · GrowthInfo en kiki ──────────────────────────────────────────────── */
  const tablero = await catalogos.tableroPorDefectoDeCliente('kiki')
  assert.ok(tablero?.esDefault, 'kiki tiene tablero por defecto')
  const kTodo = tablero.etapas.find((e) => e.clave === 'todo')
  const kDone = tablero.etapas.find((e) => e.clave === 'done')

  const k = await tareas.crear({ titulo: `${MARCA} kiki`, origen: 'portal', clientId: 'kiki', cuadrante: 'q1', categoria: 'afiliados', descripcion: 'desde 2day' })
  creado.portal.push(k.id)
  assert.equal(k.origen, 'portal'); assert.equal(k.clientId, 'kiki')
  assert.equal(k.pipelineId, tablero.id, 'pipeline_id = tablero por defecto de kiki')
  assert.equal(k.etapaId, kTodo.id, 'stage_id = etapa todo de kiki')
  assert.equal(k.estado, 'todo'); assert.equal(k.prioridadPortal, 'urgente', 'q1 → urgente')
  assert.equal(k.categoria, 'afiliados'); assert.equal(k.seguida, true, 'nace seguida'); assert.equal(k.cuadrante, 'q1')
  const fila = (await sb.from('tasks').select('*').eq('id', k.id).single()).data
  assert.equal(fila.visibilidad, 'interna'); assert.equal(fila.created_by, usuario.id); assert.equal(fila.assignee_id, null)
  assert.ok(Number(fila.position) >= 1, 'position = último + 1')
  ok('kiki: nace en tasks con tablero, etapa todo, prioridad, categoría, interna, created_by=yo; + capa seguida')

  // Una categoría que no es de las 7 cae en general (check del portal).
  const k2 = await tareas.crear({ titulo: `${MARCA} kiki 2`, clientId: 'kiki', categoria: 'inventada' })
  creado.portal.push(k2.id)
  assert.equal(k2.categoria, 'general'); assert.equal(k2.prioridadPortal, 'media', 'sin cuadrante → media')
  ok('kiki: categoría fuera de las 7 → general; sin cuadrante → media')

  /* ── 3 · a done: los dos ejes ────────────────────────────────────────────── */
  const kHecha = await tareas.completar(k)
  const enTasks = (await sb.from('tasks').select('stage_id, status, completed, completed_at').eq('id', k.id).single()).data
  assert.equal(enTasks.stage_id, kDone.id, 'stage_id = etapa done del tablero de kiki')
  assert.equal(enTasks.status, 'done', 'status = done')
  assert.equal(enTasks.completed, true, 'completed = true')
  assert.ok(enTasks.completed_at, 'completed_at lo pone el trigger del portal')
  assert.equal(kHecha.hecha, true); assert.equal(kHecha.estado, 'done'); assert.equal(kHecha.etapaId, kDone.id)
  ok('kiki → done: en tasks stage_id = done de kiki Y status = done Y completed = true')

  const kAbierta = await tareas.completar(kHecha, false)
  const reab = (await sb.from('tasks').select('stage_id, status, completed').eq('id', k.id).single()).data
  assert.deepEqual(reab, { stage_id: kTodo.id, status: 'todo', completed: false })
  ok('kiki: reabrir vuelve a todo en los dos ejes')

  /* ── 4 · seguir / deseguir · capa · archivar ─────────────────────────────── */
  const noSeg = await tareas.seguir(kAbierta, false)
  assert.equal(noSeg.seguida, false)
  let c = (await sb.from('hoy_capa').select('seguida').eq('tarea_id', k.id).single()).data
  assert.equal(c.seguida, false)
  // La creé yo: sigue en la vista aunque no la siga.
  assert.ok((await tareas.cargarTodas()).some((t) => t.id === k.id), 'creada por mí → sigue en la vista sin seguirla')
  const siSeg = await tareas.seguir(noSeg, true)
  assert.equal(siSeg.seguida, true)
  ok('kiki: seguir / deseguir escriben hoy_capa.seguida')

  const capa = await tareas.capa(k.id, 'portal', { notas: 'nota privada', horaInicio: '09:30', horaFin: '10:00', hoyPara: hoy })
  assert.equal(capa.notas, 'nota privada'); assert.equal(capa.horaInicio, '09:30'); assert.equal(capa.seguida, true, 'el upsert no pisa lo que no manda')
  const kPlan = await tareas.planificarHoy(siSeg, null)
  assert.equal(kPlan.hoyPara, null); assert.equal(kPlan.notas, 'nota privada')
  ok('capa: upsert por tarea_id sin pisar el resto; planificarHoy')

  const kArch = await tareas.archivar(kPlan)
  assert.ok(kArch.archivadoEn)
  assert.ok(!(await tareas.cargarTodas()).some((t) => t.id === k.id), 'archivada: fuera de la lista')
  assert.ok((await tareas.cargarTodas({ incluirArchivadas: true })).some((t) => t.id === k.id), 'con incluirArchivadas sí')
  ok('kiki: archivar escribe tasks.archived_at y la saca de la lista')

  let borrarPortal
  try { await tareas.borrar(kArch); borrarPortal = 'borró' } catch (e) { borrarPortal = e.message }
  assert.match(borrarPortal, /no se borra desde 2day/)
  ok('kiki: borrar una del portal se niega (se archiva)')

  /* ── 5 · explorar · comentarios ──────────────────────────────────────────── */
  const explorar = await tareas.cargarExplorar()
  assert.ok(explorar.some((t) => t.id === k2.id && t.clientId === 'kiki' && t.seguida === true), 'explorar trae la de kiki con su capa')
  assert.ok(explorar.every((t) => t.clientId && !t.archivadoEn), 'sólo vivas y con cliente')
  const com = await tareas.comentar(k2.id, `${MARCA} comentario`)
  assert.equal(com.autorId, usuario.id)
  assert.ok((await tareas.cargarComentarios(k2.id)).some((x) => x.id === com.id))
  ok('explorar GrowthInfo y comentarios del portal')

  /* ── 6 · reiniciar el día ────────────────────────────────────────────────── */
  const ayer = sumarDias(hoy, -1)
  const pAyer = await tareas.crear({ titulo: `${MARCA} de ayer`, origen: 'hoy', hoyPara: ayer })
  creado.personales.push(pAyer.id)
  const cerrados = await tareas.reiniciarDia(hoy)
  const dia = cerrados.find((d) => d.fecha === ayer)
  assert.ok(dia && dia.planificadas >= 1, 'apunta el día en hoy_dias')
  const pTras = (await tareas.cargarTodas()).find((t) => t.id === pAyer.id)
  assert.equal(pTras.hoyPara, null, 'la no hecha vuelve a Siguiente')
  const dias = await tareas.cargarDias(ayer, ayer)
  assert.equal(dias[0]?.fecha, ayer)
  ok('reiniciarDia: cierra ayer en hoy_dias y quita hoy_para a las no hechas')

  /* ── 7 · hábitos ─────────────────────────────────────────────────────────── */
  const h = await habitos.crearHabito({ nombre: `${MARCA} hábito`, cadencia: 'dias', dias: [1, 3, 5] })
  creado.habitos.push(h.id)
  assert.deepEqual(h.dias, [1, 3, 5])
  await habitos.marcar(h.id, hoy, true)
  let marcas = await habitos.cargarMarcas(hoy, hoy)
  assert.ok(marcas.some((m) => m.habitoId === h.id && m.fecha === hoy))
  await habitos.marcar(h.id, hoy, false)
  marcas = await habitos.cargarMarcas(hoy, hoy)
  assert.ok(!marcas.some((m) => m.habitoId === h.id))
  const hArch = await habitos.archivarHabito(h.id)
  assert.ok(hArch.archivadoEn)
  ok('hábitos: crear, marcar, desmarcar, archivar')

  /* ── 8 · plantillas ──────────────────────────────────────────────────────── */
  const pl = await plantillas.crearPlantilla({ nombre: `${MARCA} plantilla` })
  creado.plantillas.push(pl.id)
  const items = await plantillas.guardarItems(pl.id, [
    { titulo: `${MARCA} ítem 1`, cuadrante: 'q3', diasOffset: 0, grupo: 'Fase 1' },
    { titulo: `${MARCA} ítem 2`, cuadrante: 'q2', diasOffset: 3, grupo: 'Fase 1' },
  ])
  assert.equal(items.length, 2)
  const nacidas = await plantillas.instanciar({ ...pl, items }, { proyectoId: null, fechaBase: hoy })
  creado.personales.push(...nacidas.map((t) => t.id))
  assert.equal(nacidas[1].vence, sumarDias(hoy, 3), 'vence = fechaBase + offset')
  assert.equal(nacidas[1].cuadrante, 'q2')
  ok('plantillas: crear, guardar ítems, instanciar en personal con fechas')
} catch (e) {
  ko('el recorrido se rompió', e)
  if (e?.causa) console.log('    causa:', e.causa)
} finally {
  /* ── LIMPIEZA: nada de prueba se queda ───────────────────────────────────── */
  console.log('\nlimpieza')
  const notas = []
  for (const id of creado.personales) {
    const r1 = await sb.from('hoy_capa').delete().eq('tarea_id', id)
    const r2 = await sb.from('hoy_tareas').delete().eq('id', id)
    if (r1.error || r2.error) notas.push(`personal ${id}: ${(r1.error || r2.error).message}`)
  }
  for (const id of creado.portal) {
    await sb.from('task_comments').delete().eq('task_id', id)
    await sb.from('hoy_capa').delete().eq('tarea_id', id)
    const r = await sb.from('tasks').delete().eq('id', id).select('id')
    const borrada = !r.error && r.data?.length === 1
    if (!borrada) {
      // La RLS de borrado en tasks es de dirección (`is_agency`). Si esta cuenta no puede,
      // se archiva con la marca para que se distinga a simple vista, y se dice.
      const a = await sb.from('tasks').update({ title: `${MARCA} (archivada por el test)`, archived_at: new Date().toISOString() }).eq('id', id)
      notas.push(`tasks ${id}: no se pudo borrar (${r.error?.message || 'RLS'}) → archivada${a.error ? ` (y archivar falló: ${a.error.message})` : ''}`)
    }
  }
  for (const id of creado.habitos) {
    const r = await sb.from('hoy_habitos').delete().eq('id', id)
    if (r.error) notas.push(`hábito ${id}: ${r.error.message}`)
  }
  for (const id of creado.plantillas) {
    const r = await sb.from('hoy_plantillas').delete().eq('id', id)
    if (r.error) notas.push(`plantilla ${id}: ${r.error.message}`)
  }
  // El día cerrado por la prueba se borra si lo abrió la prueba (no había fila antes).
  await sb.from('hoy_dias').delete().eq('fecha', sumarDias(hoy, -1)).eq('planificadas', 1).eq('hechas', 0)
  const restos = await sb.from('tasks').select('id').like('title', `${MARCA}%`)
  const restosHoy = await sb.from('hoy_tareas').select('id').like('titulo', `${MARCA}%`)
  paso(`nada de prueba queda en tasks ni en hoy_tareas`, (restos.data || []).length === 0 && (restosHoy.data || []).length === 0)
  if (notas.length) { console.log('  ⚠ notas de limpieza:'); notas.forEach((n) => console.log('    -', n)) }
  else ok('todo borrado con la propia sesión (la RLS de tasks lo permite: rol agency)')
}

cerrar('e2e-alex.mjs')
