/**
 * arrastreHito.js — mover los frentes en el Gantt arrastrando (LOGICA §5.4).
 *
 * Mismo criterio que `arrastreHora.js` (§5.1), en horizontal:
 *   dedo:  pulsación sostenida (LARGO_MS sin moverse) → levanta; moverse antes es scroll del Gantt.
 *          Desde que levanta, `touchmove` NO pasivo con `preventDefault` para que el gesto sea nuestro.
 *   ratón: tirar UMBRAL_RATON px con el botón pulsado → levanta.
 *
 * Lo único que cambia mientras se arrastra es `vuelo` = { id, modo, delta } (días, imán a día
 * entero): la vista pinta el hito desplazado con eso. Al soltar se llama `alSoltar(hito, modo, delta)`.
 * Un toque sin arrastre deja pasar el click (abre la hoja); tras un arrastre el click se suprime.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const LARGO_MS = 300
const UMBRAL_DEDO = 8
const UMBRAL_RATON = 4

/** @param {{ alSoltar: (hito, modo, delta) => void, anchoDia: () => number }} p */
export function usarArrastreHito({ alSoltar, anchoDia }) {
  const [vuelo, setVuelo] = useState(null)
  const sesion = useRef(null)
  const suprimirClick = useRef(false)
  const alSoltarRef = useRef(alSoltar)
  alSoltarRef.current = alSoltar

  const limpiar = useCallback(() => {
    const s = sesion.current
    if (!s) return
    if (s.temporizador) clearTimeout(s.temporizador)
    s.quitar()
    document.body.classList.remove('arrastrando')
    sesion.current = null
    setVuelo(null)
  }, [])
  useEffect(() => limpiar, [limpiar])

  const empezar = useCallback((e, hito, modo) => {
    if (sesion.current || !hito.fecha) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const dedo = e.pointerType !== 'mouse'
    const s = {
      hito, modo, x0: e.clientX, y0: e.clientY, ancho: anchoDia() || 28,
      levantado: false, delta: 0, temporizador: null, quitar: () => {},
    }
    sesion.current = s

    const levantar = () => {
      s.levantado = true
      document.body.classList.add('arrastrando')
      if (dedo) navigator.vibrate?.(12)
      setVuelo({ id: hito.id, modo, delta: 0 })
    }
    const mover = (x, y) => {
      const dx = x - s.x0
      if (!s.levantado) {
        if (dedo) {
          if (Math.hypot(dx, y - s.y0) > UMBRAL_DEDO) limpiar() // era scroll
          return
        }
        if (Math.abs(dx) < UMBRAL_RATON) return
        levantar()
      }
      const delta = Math.round(dx / s.ancho)
      if (delta !== s.delta) { s.delta = delta; setVuelo({ id: hito.id, modo, delta }) }
    }
    const soltar = () => {
      const { levantado, delta } = s
      limpiar()
      if (!levantado) return // un toque: el click abre la hoja
      suprimirClick.current = true
      setTimeout(() => { suprimirClick.current = false }, 0)
      if (delta) alSoltarRef.current(hito, modo, delta)
    }

    if (dedo) {
      const tm = (ev) => {
        const t = ev.touches[0]
        if (!t) return
        if (s.levantado) ev.preventDefault()
        mover(t.clientX, t.clientY)
      }
      const te = () => soltar()
      document.addEventListener('touchmove', tm, { passive: false })
      document.addEventListener('touchend', te)
      document.addEventListener('touchcancel', te)
      s.temporizador = setTimeout(levantar, LARGO_MS)
      s.quitar = () => {
        document.removeEventListener('touchmove', tm)
        document.removeEventListener('touchend', te)
        document.removeEventListener('touchcancel', te)
      }
    } else {
      const mm = (ev) => mover(ev.clientX, ev.clientY)
      const mu = () => soltar()
      document.addEventListener('mousemove', mm)
      document.addEventListener('mouseup', mu)
      s.quitar = () => {
        document.removeEventListener('mousemove', mm)
        document.removeEventListener('mouseup', mu)
      }
    }
    e.stopPropagation()
  }, [anchoDia, limpiar])

  /** Para cada elemento arrastrable: `{...props(hito, modo)}`. */
  const props = useCallback((hito, modo = 'mover') => ({
    onPointerDown: (e) => empezar(e, hito, modo),
    onContextMenu: (e) => e.preventDefault(),
  }), [empezar])

  return { vuelo, props, suprimirClick }
}
