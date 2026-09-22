/**
 * protocolo-siembra.mjs — ¿está el Protocolo sembrado como dicta LOGICA §10? (§10.8)
 *   · con login real (cuenta del vault): `hoy_sembrar_protocolo()` no falla;
 *   · 22 bloques con sus horas y días; los hábitos de §10.2 con hora/grupo/tipo;
 *   · el reto arranca el 23-09 y acaba el 21-12; 5 hitos; las 2 tareas semanales;
 *   · sembrar DOS veces no duplica nada; los dailies quedaron archivados.
 * Sin framework: assert + console. `node tests/protocolo-siembra.mjs`.
 */
import { entrar, paso, ok, ko, cerrar } from './_comun.mjs'

console.log('protocolo-siembra.mjs — el Protocolo en la base\n')

let sb
try { ;({ sb } = await entrar()); ok('login con la cuenta del vault') } catch (e) { ko('login', e); cerrar('protocolo-siembra.mjs') }

const cuenta = async (tabla, filtro = (q) => q) => {
  const { count, error } = await filtro(sb.from(tabla).select('*', { count: 'exact', head: true }))
  if (error) throw error
  return count
}

try {
  const s1 = await sb.rpc('hoy_sembrar_protocolo')
  paso('hoy_sembrar_protocolo() no falla', !s1.error, s1.error)
  const antes = {
    bloques: await cuenta('hoy_bloques'), habitos: await cuenta('hoy_habitos', (q) => q.is('archivado_at', null)),
    retos: await cuenta('hoy_retos'), hitos: await cuenta('hoy_hitos'),
    tareas: await cuenta('hoy_tareas', (q) => q.is('archivado_at', null)),
  }
  const s2 = await sb.rpc('hoy_sembrar_protocolo')
  paso('sembrar por segunda vez no falla', !s2.error, s2.error)
  const despues = {
    bloques: await cuenta('hoy_bloques'), habitos: await cuenta('hoy_habitos', (q) => q.is('archivado_at', null)),
    retos: await cuenta('hoy_retos'), hitos: await cuenta('hoy_hitos'),
    tareas: await cuenta('hoy_tareas', (q) => q.is('archivado_at', null)),
  }
  paso('sembrar dos veces no duplica nada', JSON.stringify(antes) === JSON.stringify(despues), new Error(`${JSON.stringify(antes)} → ${JSON.stringify(despues)}`))

  /* bloques */
  const { data: bloques } = await sb.from('hoy_bloques').select('nombre, fase, inicio, fin, dias, posicion, activo').order('posicion')
  paso('22 bloques', bloques.length === 22, new Error(`hay ${bloques.length}`))
  const b = (n) => bloques.find((x) => x.nombre.startsWith(n))
  paso('Activación 04:30–04:45 todos los días', b('Activación')?.inicio === '04:30:00' && b('Activación')?.fin === '04:45:00' && b('Activación')?.dias.length === 7)
  paso('Entrenamiento 06:40–07:30 L·M·J·V', b('Entrenamiento')?.inicio === '06:40:00' && JSON.stringify(b('Entrenamiento')?.dias) === '[1,2,4,5]')
  paso('Inmersión total 08:00–11:00 L–V', b('Inmersión total')?.fin === '11:00:00' && b('Inmersión total')?.dias.length === 5)
  paso('Sueño 22:00–04:30 (cruza medianoche)', b('Sueño')?.inicio === '22:00:00' && b('Sueño')?.fin === '04:30:00')
  paso('Meal prep sólo domingo', JSON.stringify(b('Meal prep')?.dias) === '[7]')
  const fases = new Set(bloques.map((x) => x.fase))
  paso('las 7 fases están', ['calibracion','nutricion','cuerpo','ofensiva','reuniones','consolidacion','apagado'].every((f) => fases.has(f)))

  /* hábitos */
  const { data: habitos } = await sb.from('hoy_habitos').select('nombre, grupo, tipo, hora, cadencia, dias, unidad, objetivo, bloque_id, plan, descripcion').is('archivado_at', null).order('posicion')
  const h = (n) => habitos.find((x) => x.nombre === n)
  paso('al menos los 26 hábitos de §10.2', habitos.length >= 26, new Error(`hay ${habitos.length}`))
  paso('«45 min training» pasó a «Entreno» con plan de 7 días', !h('45 min training') && h('Entreno') && Object.keys(h('Entreno').plan).length === 7)
  paso('Entreno toca L·M·J·V a las 06:40 en su bloque', h('Entreno')?.cadencia === 'dias' && JSON.stringify(h('Entreno')?.dias) === '[1,2,4,5]' && h('Entreno')?.hora === '06:40:00' && !!h('Entreno')?.bloque_id)
  paso('el plan del lunes es Leopardo y el del viernes León', h('Entreno')?.plan['1']?.titulo.startsWith('Leopardo') && h('Entreno')?.plan['5']?.titulo.startsWith('León'))
  paso('No redbull es de tipo evitar', h('No redbull')?.tipo === 'evitar')
  paso('Peso y Horas de sueño se miden (kg, h; objetivo 6,5)', h('Peso')?.tipo === 'medir' && h('Peso')?.unidad === 'kg' && h('Horas de sueño')?.tipo === 'medir' && Number(h('Horas de sueño')?.objetivo) === 6.5)
  paso('Ayuno cerrado es evitar a las 16:00', h('Ayuno cerrado desde las 16:00')?.tipo === 'evitar' && h('Ayuno cerrado desde las 16:00')?.hora === '16:00:00')
  paso('Comida 1 lleva el plato en la descripción', (h('Comida 1')?.descripcion || '').includes('4 huevos'))
  const grupos = new Set(habitos.map((x) => x.grupo))
  paso('los 5 grupos están', ['Calibración','Cuerpo','Nutrición','Trabajo','Apagado'].every((g) => grupos.has(g)))
  paso('todos los hábitos tienen hora y bloque', habitos.every((x) => x.hora && x.bloque_id), new Error(habitos.filter((x) => !x.hora || !x.bloque_id).map((x) => x.nombre).join(', ')))
  paso('los diarios no arrastran días sueltos', habitos.filter((x) => x.cadencia === 'diario').every((x) => x.dias.length === 0))
  paso('Leer protocolo y Journal siguen vivos', !!h('Leer protocolo') && !!h('Journal process to 520424,26$'))

  /* reto */
  const { data: retos } = await sb.from('hoy_retos').select('nombre, inicio, fin, activo, descripcion')
  const reto = retos.find((r) => r.nombre === 'Zero Agent Challenge')
  paso('el reto Zero Agent Challenge existe, 2026-09-23 → 2026-12-21, activo', reto?.inicio === '2026-09-23' && reto?.fin === '2026-12-21' && reto?.activo)
  paso('la descripción dice que arranca a las 04:30', (reto?.descripcion || '').includes('04:30'))

  /* hitos */
  const { data: hitos } = await sb.from('hoy_hitos').select('frente, nombre, fecha, hecho').order('posicion')
  paso('5 hitos', hitos.length === 5, new Error(`hay ${hitos.length}`))
  paso('Chan y Alfredo lanzan el 25-09', hitos.filter((x) => x.fecha === '2026-09-25').length === 2)
  paso('Elena el 29-09; Gemelos y Jonathan sin fecha', hitos.some((x) => x.frente.startsWith('Elena') && x.fecha === '2026-09-29') && hitos.filter((x) => x.fecha === null).length === 2)

  /* tareas semanales y dailies */
  const { data: tareas } = await sb.from('hoy_todas').select('titulo, repetir, vence, hora_inicio, hora_fin, descripcion, archivado_at, hecha').eq('origen', 'hoy')
  const t = (n) => tareas.find((x) => x.titulo === n && !x.archivado_at)
  paso('Compra semanal: regla semanal, vence un domingo, con la lista', t('Compra semanal cetogénica (80–100 €)')?.repetir === 'semanal' && new Date(t('Compra semanal cetogénica (80–100 €)')?.vence + 'T12:00:00').getDay() === 0 && (t('Compra semanal cetogénica (80–100 €)')?.descripcion || '').includes('Macadamias'))
  paso('Meal prep: semanal, 16:00–18:00', t('Meal prep de la semana (2 h)')?.repetir === 'semanal' && t('Meal prep de la semana (2 h)')?.hora_inicio === '16:00:00' && t('Meal prep de la semana (2 h)')?.hora_fin === '18:00:00')
  paso('los dailies vivos quedaron archivados', !tareas.some((x) => ['Daily con Pere', 'Daily con Adri'].includes(x.titulo) && !x.archivado_at && !x.hecha))

  /* adherencia */
  const adh = await sb.rpc('hoy_adherencia_dia', { p_fecha: '2026-09-22' })
  paso('hoy_adherencia_dia() responde {tocaban, hechos}', !adh.error && Array.isArray(adh.data) && 'tocaban' in adh.data[0], adh.error)
} catch (e) { ko('la siembra', e) }

cerrar('protocolo-siembra.mjs')
