import { useCallback } from 'react'
import { useDatos } from './useDatos.jsx'
import * as datosTareas from '../datos/tareas.js'

/**
 * El patrón de escritura de TODA la app para una tarea: se pinta primero (parche
 * optimista en memoria), se escribe después, se sustituye por lo releído y se recarga de
 * fondo. Si la escritura falla, se restaura la tarea de antes y se avisa.
 *
 * Vive en `estado/` y no en una pantalla porque lo usan Hoy, las cinco pestañas de
 * Tareas, el Calendario y la hoja de detalle: lo único que cambia entre ellas es la
 * acción. Dos copias del patrón acaban diciendo cosas distintas (la integración del
 * 16-09 encontró cuatro).
 *
 * `accion` devuelve la Tarea releída (o null si la tarea sale de la lista).
 * `opciones.alAcabar` corre tras el éxito (p.ej. cerrar la hoja).
 */
export function usarGuardar() {
  const { actualizarLocal, avisar, recargar } = useDatos()
  return useCallback(async (tarea, parche, accion, { alAcabar = null } = {}) => {
    if (parche) actualizarLocal({ ...tarea, ...parche })
    try {
      const nueva = await accion()
      if (nueva) actualizarLocal(nueva)
      alAcabar?.()
      recargar()
      return nueva
    } catch (e) {
      actualizarLocal(tarea)
      avisar(e.message || 'No se pudo guardar', 'error')
      return null
    }
  }, [actualizarLocal, avisar, recargar])
}

/** Completar/des-completar con los dos ejes (la capa de datos resuelve la etapa de SU tablero). */
export function usarCompletar() {
  const guardar = usarGuardar()
  return useCallback((tarea, hecha = true) => guardar(
    tarea,
    datosTareas.parcheHecha(hecha),
    () => datosTareas.completar(tarea, hecha),
  ), [guardar])
}
