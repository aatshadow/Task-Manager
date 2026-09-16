/**
 * ganchos.js — los hooks que necesita Calendario y que no tienen sitio en otro lado:
 * pulsación larga, el reloj de «ahora» y las escrituras (completar, mover de día, programar).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { horaAhora, sumarDias } from '../../datos/fechas.js'
import * as datosTareas from '../../datos/tareas.js'
import { usarGuardar, usarCompletar } from '../../estado/usarGuardar.js'

/**
 * Toque vs pulsación larga sobre el mismo elemento, con punteros (vale para dedo y ratón).
 * Devuelve props para esparcir. Si la larga dispara, el `click` que sigue se traga para
 * que no haga las dos cosas. Mover el dedo más de 10px la cancela: eso es un scroll.
 * `soloPropio` ignora las pulsaciones que empiezan en un hijo (el hueco entre tarjetas).
 */
export function usarPulsacion({ alToque, alLargo, ms = 450, soloPropio = false } = {}) {
  const temporizador = useRef(null)
  const origen = useRef(null)
  const disparada = useRef(false)

  const cancelar = useCallback(() => {
    if (temporizador.current) { clearTimeout(temporizador.current); temporizador.current = null }
    origen.current = null
  }, [])

  useEffect(() => cancelar, [cancelar])

  const onPointerDown = (e) => {
    if (!alLargo || (e.pointerType === 'mouse' && e.button !== 0)) return
    // `soloPropio`: el hueco del timeline no debe reaccionar a una pulsación sobre una tarjeta hija
    if (soloPropio && e.target !== e.currentTarget) return
    disparada.current = false
    origen.current = { x: e.clientX, y: e.clientY }
    temporizador.current = setTimeout(() => {
      temporizador.current = null
      disparada.current = true
      alLargo(e)
    }, ms)
  }
  const onPointerMove = (e) => {
    if (!origen.current) return
    if (Math.hypot(e.clientX - origen.current.x, e.clientY - origen.current.y) > 10) cancelar()
  }
  const onClick = (e) => {
    if (disparada.current) { disparada.current = false; e.preventDefault(); return }
    alToque?.(e)
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: cancelar,
    onPointerCancel: cancelar,
    onPointerLeave: cancelar,
    onClick,
    // el menú contextual del móvil (y del botón derecho) pisaría la pulsación larga
    onContextMenu: (e) => { if (alLargo) e.preventDefault() },
  }
}

/** `'HH:MM'` de ahora, que cambia justo al entrar cada minuto (la línea naranja del día). */
export function usarAhora() {
  const [ahora, setAhora] = useState(() => horaAhora())
  useEffect(() => {
    let intervalo = null
    // primero se espera al cambio de minuto y después se corre cada 60 s: así la línea
    // salta con el reloj y no 40 segundos tarde
    const espera = setTimeout(() => {
      setAhora(horaAhora())
      intervalo = setInterval(() => setAhora(horaAhora()), 60_000)
    }, (60 - new Date().getSeconds()) * 1000)
    return () => { clearTimeout(espera); if (intervalo) clearInterval(intervalo) }
  }, [])
  return ahora
}

/**
 * Las dos escrituras del calendario, construidas sobre el `usarGuardar` de estado/ (el
 * patrón de la casa: optimista → escritura → releída → recarga; si falla, restaura y
 * avisa). Una sola implementación para las dos pantallas: si cambia, cambia en las dos.
 */
export function usarGuardarTarea() {
  const guardar = usarGuardar()
  const completar = usarCompletar()

  // Cambiar de día conserva la duración: un período se desplaza entero, no se estira.
  const moverDeDia = useCallback((tarea, nuevoVence, delta) => {
    const cambios = { vence: nuevoVence }
    if (tarea.inicio) cambios.inicio = sumarDias(tarea.inicio, delta)
    return guardar(tarea, cambios, () => datosTareas.actualizar(tarea, cambios))
  }, [guardar])

  // Poner, mover o quitar la hora del día (LOGICA §5.1). Las dos horas van en la misma
  // escritura: un inicio nuevo con el fin viejo sería una duración inventada.
  const programar = useCallback((tarea, horaInicio, horaFin) => {
    const cambios = { horaInicio: horaInicio || null, horaFin: horaFin || null }
    return guardar(tarea, cambios, () => datosTareas.programar(tarea, cambios))
  }, [guardar])

  return { guardar, completar, moverDeDia, programar }
}
