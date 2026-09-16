/** Repetir (LOGICA §4.1) contra la base real, por la capa de datos. Limpia todo lo creado. */
import { entrar, paso, ok, cerrar } from './_comun.mjs'
import * as catalogos from '../src/datos/catalogos.js'
import * as tareas from '../src/datos/tareas.js'
import { hoyLocal, sumarDias, configurarReinicio } from '../src/datos/fechas.js'

const TS = Date.now()
const MARCA = `2day·prueba·repetir·${TS}`
const { sb } = await entrar()
await catalogos.sembrar()
const ajustes = await catalogos.cargarAjustes()
configurarReinicio(ajustes.horaReinicio)
const hoy = hoyLocal()
const deLaMarca = async () => (await tareas.cargarTodas({ incluirArchivadas: true })).filter((t) => t.titulo.startsWith(MARCA))

try {
  /* 1 · personal diaria con horas y cuadrante */
  const a = await tareas.crear({ titulo: `${MARCA} diaria`, origen: 'hoy', vence: hoy, hoyPara: hoy, cuadrante: 'q2', categoria: 'ia', horaInicio: '09:00', horaFin: '09:30', repetir: 'diario' })
  paso(`crear guarda la regla (${a.repetir})`, a.repetir === 'diario')

  const hecha = await tareas.completar(a, true)
  paso('completar la deja hecha', hecha.hecha === true)
  let lista = await deLaMarca()
  const b = lista.find((t) => t.id !== a.id && t.titulo === a.titulo)
  paso('al completar nace la siguiente', !!b)
  paso(`la siguiente vence mañana (${b?.vence})`, b?.vence === sumarDias(hoy, 1))
  paso(`la siguiente está planificada para su día (${b?.hoyPara})`, b?.hoyPara === sumarDias(hoy, 1))
  paso('hereda cuadrante, horas, categoría y regla', b?.cuadrante === 'q2' && b?.horaInicio === '09:00' && b?.horaFin === '09:30' && b?.categoria === 'ia' && b?.repetir === 'diario')
  paso('la siguiente nace sin hacer', b?.hecha === false)

  /* 2 · des-completar y volver a completar no duplica */
  const reabierta = await tareas.completar(hecha, false)
  await tareas.completar(reabierta, true)
  lista = await deLaMarca()
  paso(`sin duplicar (${lista.length} tareas, se esperan 2)`, lista.length === 2)

  /* 3 · saltar mueve sin completar y sin engendrar */
  const saltada = await tareas.saltar(b)
  paso(`saltar → pasado mañana (${saltada.vence}), sin hacer`, saltada.vence === sumarDias(hoy, 2) && saltada.hecha === false && saltada.hoyPara === sumarDias(hoy, 2))
  lista = await deLaMarca()
  paso(`saltar no engendra (${lista.length} tareas)`, lista.length === 2)

  /* 4 · quitar la regla: la tarea sigue, no engendra al completar */
  await tareas.capa(saltada.id, 'hoy', { repetir: null })
  const sinRegla = { ...saltada, repetir: null }
  await tareas.completar(sinRegla, true)
  lista = await deLaMarca()
  paso(`sin regla no engendra (${lista.length} tareas)`, lista.length === 2)

  /* 5 · semanal en GrowthInfo (kiki): nace en `tasks`, +7 días, tablero de kiki */
  const kiki = (await catalogos.cargarClientes()).find((c) => c.nombre.toLowerCase() === 'kiki')
  const p = await tareas.crear({ titulo: `${MARCA} semanal kiki`, origen: 'portal', clientId: kiki.id, vence: hoy, cuadrante: 'q3', categoria: 'contenido', repetir: 'semanal' })
  await tareas.completar(p, true)
  lista = await deLaMarca()
  const p2 = lista.find((t) => t.titulo === p.titulo && t.id !== p.id)
  paso('portal: nace la siguiente en GrowthInfo', !!p2 && p2.origen === 'portal' && p2.clientId === kiki.id)
  paso(`portal: vence +7 (${p2?.vence}), cuadrante y categoría heredados`, p2?.vence === sumarDias(hoy, 7) && p2?.cuadrante === 'q3' && p2?.categoria === 'contenido' && p2?.repetir === 'semanal')
  const fila = (await sb.from('tasks').select('status, completed, pipeline_id, stage_id, created_by').eq('id', p2.id).single()).data
  paso(`portal: la nueva está en todo/sin completar (${fila?.status}/${fila?.completed})`, fila?.status === 'todo' && fila?.completed === false && !!fila?.stage_id)
} finally {
  const todas = await deLaMarca()
  for (const t of todas) await tareas.borrar(t).catch((e) => console.log('  (limpieza)', t.titulo, e.message))
  ok(`limpiado (${todas.length})`)
}
cerrar('repetir-e2e')
