/**
 * calendario.js — la lógica pura de la pantalla Calendario (sin React, sin Supabase).
 *
 * Una tarea entra en el calendario POR `vence` (LOGICA §5): sin fecha de vencimiento no
 * se pinta, aunque esté planificada para Hoy (eso es cosa de la pantalla Hoy). Si además
 * tiene `inicio`, es un período y se pinta como barra fina en todos sus días.
 */
import { aMinutos, rangoDias, sumarDias } from '../../datos/fechas.js'

/** El día que se pinta va de 6:00 a 24:00; lo de antes de las 6 se pega arriba. */
export const HORA_MIN = 6
export const HORA_MAX = 24
export const PX_HORA = 56
export const HORAS = Array.from({ length: HORA_MAX - HORA_MIN }, (_, i) => HORA_MIN + i)

/** ¿Es un período (inicio y vence, y el inicio antes del vence)? */
export const esPeriodo = (t) => !!t.inicio && !!t.vence && t.inicio < t.vence

/**
 * Índice día → { vencen, periodo } para un rango de días. `vencen` son las que vencen
 * ese día (la fila de la lista); `periodo` las que lo atraviesan sin vencer en él (la
 * barra fina). Se calcula una vez por rango y no por celda: la rejilla del mes tiene
 * 42 celdas y no hace falta recorrer las tareas 42 veces.
 */
export function indicePorDia(tareas, desde, hasta) {
  const indice = new Map()
  for (const dia of rangoDias(desde, hasta)) indice.set(dia, { vencen: [], periodo: [] })
  for (const t of tareas) {
    if (!t.vence || t.archivadoEn) continue
    if (indice.has(t.vence)) indice.get(t.vence).vencen.push(t)
    if (!esPeriodo(t)) continue
    // sólo los días del período que caen dentro del rango pedido
    const primero = t.inicio > desde ? t.inicio : desde
    const ultimo = sumarDias(t.vence, -1) < hasta ? sumarDias(t.vence, -1) : hasta
    if (primero > ultimo) continue
    for (const dia of rangoDias(primero, ultimo)) indice.get(dia).periodo.push(t)
  }
  return indice
}

/** Lo de un día suelto (para la vista Día, que no necesita índice). */
export function tareasDelDia(tareas, fecha) {
  return indicePorDia(tareas, fecha, fecha).get(fecha) || { vencen: [], periodo: [] }
}

/** ¿Hay algo pendiente ese día? (decide si el punto va en naranja o apagado) */
export const hayPendientes = (dia) => dia.vencen.some((t) => !t.hecha) || dia.periodo.some((t) => !t.hecha)

/** Minutos de inicio/fin de una tarea con hora; sin `horaFin` dura una hora (encargo). */
export function tramoDe(t) {
  const inicio = aMinutos(t.horaInicio)
  let fin = t.horaFin ? aMinutos(t.horaFin) : inicio + 60
  // un fin anterior al inicio es un dato roto: se pinta como una hora, no como cero
  if (fin <= inicio) fin = inicio + 60
  return { inicio, fin }
}

/** Minutos → píxeles desde las 6:00. Lo anterior a las 6 se pega arriba; lo de después de las 24 abajo. */
export function alturaDe(minutos) {
  const min = HORA_MIN * 60
  const max = HORA_MAX * 60
  const m = Math.min(Math.max(minutos, min), max)
  return ((m - min) / 60) * PX_HORA
}

/**
 * Coloca las tareas con hora en el timeline: `[{ tarea, top, alto, columna, columnas }]`.
 * Las que se solapan se reparten en columnas dentro de su grupo (la primera libre cuyo
 * final ya pasó), y todo el grupo comparte el número de columnas para que ninguna se
 * pinte encima de otra. Es el mismo reparto que hace cualquier agenda.
 *
 * El reparto se hace en PÍXELES ya pintados (con el clamp a las 6:00 y el alto mínimo
 * aplicados), no en minutos: dos tareas de 15 min seguidas no se solapan en el reloj pero
 * sí en pantalla, y una de las 5:00 pegada arriba cae encima de la de las 6:00.
 */
export const ALTO_MINIMO = 28

export function colocarEnTimeline(tareas) {
  const conHora = tareas
    .filter((t) => t.horaInicio)
    .map((t) => {
      const { inicio, fin } = tramoDe(t)
      const top = alturaDe(inicio)
      // mínimo visible: una tarea de 10 minutos también tiene que poderse tocar
      const abajo = Math.max(alturaDe(fin), top + ALTO_MINIMO)
      return { tarea: t, inicio, fin, top, abajo }
    })
    // misma altura: primero la anterior en el reloj (la de las 5:00 queda a la izquierda de la de las 6:00)
    .sort((a, b) => a.top - b.top || a.inicio - b.inicio || b.abajo - a.abajo)

  const colocadas = []
  let grupo = []          // eventos del grupo de solape en curso
  let finesColumnas = []  // borde inferior (px) de la última tarjeta de cada columna del grupo
  let finGrupo = -1

  const cerrarGrupo = () => {
    const columnas = finesColumnas.length
    for (const e of grupo) colocadas.push({ ...e, columnas })
    grupo = []; finesColumnas = []; finGrupo = -1
  }

  for (const e of conHora) {
    if (grupo.length && e.top >= finGrupo) cerrarGrupo()
    let columna = finesColumnas.findIndex((fin) => fin <= e.top)
    if (columna === -1) { columna = finesColumnas.length; finesColumnas.push(e.abajo) }
    else finesColumnas[columna] = e.abajo
    finGrupo = Math.max(finGrupo, e.abajo)
    grupo.push({
      tarea: e.tarea,
      inicio: e.inicio,
      fin: e.fin,
      top: e.top,
      alto: e.abajo - e.top,
      columna,
    })
  }
  if (grupo.length) cerrarGrupo()
  return colocadas
}

/** ¿Está en curso a esa hora? (`ahora` en minutos) */
export const enCurso = (colocada, ahora) => ahora >= colocada.inicio && ahora < colocada.fin

/** `'09:00 – 10:30'` o `'09:00'` para la fila. */
export function textoHoras(t) {
  if (!t.horaInicio) return ''
  return t.horaFin ? `${t.horaInicio} – ${t.horaFin}` : t.horaInicio
}
