/**
 * arrastreHora.js — el gesto de «organizar el día arrastrando» (LOGICA §5.1).
 *
 * Un solo hook para la vista Día: cada tarea (fila de «Todo el día» o tarjeta del timeline)
 * recibe `props(tarea, { desde })`, y el hook lleva la sesión entera del gesto sin pasar por
 * React hasta que hace falta pintar algo:
 *
 *   dedo:  pulsación sostenida (LARGO_MS sin moverse) → levanta. Moverse antes es scroll.
 *   ratón: tirar UMBRAL_RATON px con el botón pulsado → levanta (el ratón no hace scroll).
 *
 * Mientras está levantada, el fantasma sigue al puntero con `transform` directo (sin render
 * por movimiento) y sólo se pasa por estado cuando cambia el minuto imantado o la zona en la
 * que está. El scroll lo hacemos nosotros: cerca de los bordes de la ventana la página se
 * desplaza sola en un bucle de animación.
 *
 * ★ Por qué NO es el `drag` de framer-motion: el timeline tiene `touch-action: pan-y` (hay que
 * poder hacer scroll tocando una tarjeta) y con eso el navegador se queda el gesto en cuanto
 * el dedo se mueve. La única forma de que un arrastre por dedo sea NUESTRO y fluido es
 * levantar sin moverse y, desde ese instante, `preventDefault()` en cada `touchmove` con un
 * escuchador NO pasivo. Es lo que hacen dnd-kit y Sortable con su activación por retardo.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { altoDeDuracion, alturaDe, duracionDe, minutoEnPista } from './calendario.js'

const LARGO_MS = 300        // dedo: cuánto hay que sostener para levantar
const UMBRAL_DEDO = 8       // px de movimiento antes de levantar = scroll, no arrastre
const UMBRAL_RATON = 5      // px con el botón pulsado = arrastre
const AGARRE_LISTA = 22     // desde «Todo el día» el borde superior queda 22px sobre el dedo: la hora se ve
const BORDE_SCROLL = 96     // px desde el borde de la ventana en los que la página empieza a desplazarse
const SCROLL_MAX = 18       // px por fotograma en el borde mismo
const ALTO_NAV = 64 + 24    // la nav fija de abajo (y su área segura) no cuenta como ventana útil
const HOLGURA_X = 64        // el margen de las horas también es pista: no hay que soltar milimétricamente

/**
 * @param {{ pistaRef, listaRef, alSoltar }} p
 *   pistaRef  → el `.cal-pista-horas` (la columna de las tarjetas)
 *   listaRef  → la sección «Todo el día» (soltar ahí = quitar la hora)
 *   alSoltar(tarea, { minutos, duracion })   minutos null = quitar la hora
 * @returns {{ vuelo, fantasmaRef, props }}
 *   vuelo → null o { tarea, desde, duracion, alto, minutos, sobre } para pintar el fantasma, la
 *           línea imán y la zona encendida
 */
export function usarArrastreHora({ pistaRef, listaRef, alSoltar }) {
  const [vuelo, setVuelo] = useState(null)
  const sesion = useRef(null)       // la sesión del gesto en curso; fuera de React a propósito
  const fantasmaRef = useRef(null)
  const suprimirClick = useRef(false)
  const alSoltarRef = useRef(alSoltar)
  alSoltarRef.current = alSoltar

  const limpiar = useCallback(() => {
    const s = sesion.current
    if (!s) return
    if (s.temporizador) clearTimeout(s.temporizador)
    if (s.raf) cancelAnimationFrame(s.raf)
    s.quitar()
    document.body.classList.remove('arrastrando')
    sesion.current = null
    setVuelo(null)
  }, [])

  // Si la vista se desmonta con algo en el aire (cambio de pestaña), no quedan escuchadores colgando
  useEffect(() => limpiar, [limpiar])

  /** Dónde está el fantasma y qué minuto marca; pinta el fantasma y, si algo cambió, el estado. */
  const colocar = useCallback((x, y) => {
    const s = sesion.current
    if (!s || !s.levantada) return
    const pista = pistaRef.current?.getBoundingClientRect()
    const lista = listaRef.current?.getBoundingClientRect()
    if (!pista) return

    const bordeSuperior = y - s.agarre
    let sobre = null
    let minutos = null
    let yFantasma = bordeSuperior

    if (x >= pista.left - HOLGURA_X && x <= pista.right + 24 && y >= pista.top - 12 && y <= pista.bottom + 12) {
      sobre = 'pista'
      minutos = minutoEnPista(bordeSuperior - pista.top, s.duracion)
      // imantado: el fantasma salta de 5 en 5 minutos (4,7px), que a la vista es continuo
      yFantasma = pista.top + alturaDe(minutos)
    } else if (lista && s.desde === 'pista' && y >= lista.top - 8 && y <= lista.bottom + 8) {
      sobre = 'lista'
    }

    const f = fantasmaRef.current
    if (f) {
      f.style.transform = `translate3d(${pista.left + 8}px, ${yFantasma}px, 0)`
      f.style.width = `${pista.width - 8}px`
    }
    s.ultimo = { x, y }
    if (minutos !== s.minutos || sobre !== s.sobre) {
      s.minutos = minutos
      s.sobre = sobre
      setVuelo((v) => (v ? { ...v, minutos, sobre } : v))
    }
  }, [pistaRef, listaRef])

  /** El bucle de desplazamiento: cerca de un borde, la página se mueve y el fantasma se recoloca. */
  const bucle = useCallback(() => {
    const s = sesion.current
    if (!s || !s.levantada) return
    const { y, x } = s.ultimo
    const abajo = window.innerHeight - ALTO_NAV - BORDE_SCROLL
    let v = 0
    if (y < BORDE_SCROLL) v = -SCROLL_MAX * Math.min(1, (BORDE_SCROLL - y) / BORDE_SCROLL)
    else if (y > abajo) v = SCROLL_MAX * Math.min(1, (y - abajo) / BORDE_SCROLL)
    if (v) {
      const antes = window.scrollY
      window.scrollBy(0, v)
      if (window.scrollY !== antes) colocar(x, y)
    }
    s.raf = requestAnimationFrame(bucle)
  }, [colocar])

  const levantar = useCallback(() => {
    const s = sesion.current
    if (!s || s.levantada) return
    s.levantada = true
    s.temporizador = null
    try { navigator.vibrate?.(12) } catch { /* sin motor háptico, sin vibración */ }
    document.body.classList.add('arrastrando')
    setVuelo({ tarea: s.tarea, desde: s.desde, duracion: s.duracion, alto: s.alto, minutos: null, sobre: null })
    // el fantasma se monta en este render; se coloca en el siguiente fotograma, cuando ya existe
    requestAnimationFrame(() => { colocar(s.ultimo.x, s.ultimo.y); s.raf = requestAnimationFrame(bucle) })
  }, [colocar, bucle])

  const soltar = useCallback(() => {
    const s = sesion.current
    if (!s) return
    if (s.levantada) {
      // el click llega en este mismo turno; si no llega (dedo), que no se coma el siguiente
      suprimirClick.current = true
      setTimeout(() => { suprimirClick.current = false }, 0)
      if (s.sobre === 'pista' && s.minutos != null) alSoltarRef.current(s.tarea, { minutos: s.minutos, duracion: s.duracion })
      else if (s.sobre === 'lista') alSoltarRef.current(s.tarea, { minutos: null, duracion: null })
    }
    limpiar()
  }, [limpiar])

  const props = useCallback((tarea, { desde }) => ({
    onPointerDown: (e) => {
      if (sesion.current) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      // la Marca (completar) es un botón dentro de la fila: ahí no se levanta nada
      if (e.target.closest('button')) return
      const rect = e.currentTarget.getBoundingClientRect()
      const duracion = desde === 'pista' ? duracionDe(tarea) : null
      const s = {
        tarea, desde, duracion,
        alto: altoDeDuracion(duracion),
        pointerId: e.pointerId,
        raton: e.pointerType === 'mouse',
        x0: e.clientX, y0: e.clientY,
        ultimo: { x: e.clientX, y: e.clientY },
        // desde la pista se agarra por donde se tocó; desde la lista, por arriba
        agarre: desde === 'pista' ? e.clientY - rect.top : AGARRE_LISTA,
        levantada: false, temporizador: null, raf: null, minutos: null, sobre: null,
        quitar: () => {},
      }
      sesion.current = s

      const alMover = (ev) => {
        const c = sesion.current
        if (!c || ev.pointerId !== c.pointerId) return
        if (c.levantada) { colocar(ev.clientX, ev.clientY); return }
        const distancia = Math.hypot(ev.clientX - c.x0, ev.clientY - c.y0)
        c.ultimo = { x: ev.clientX, y: ev.clientY }
        if (c.raton) { if (distancia > UMBRAL_RATON) levantar() }
        else if (distancia > UMBRAL_DEDO) limpiar()   // se movió antes de tiempo: es un scroll
      }
      const alSubir = (ev) => { if (ev.pointerId === sesion.current?.pointerId) soltar() }
      const alCancelar = () => limpiar()
      // NO pasivo: mientras hay algo en el aire, el scroll del navegador no entra
      const alTocarMover = (ev) => { if (sesion.current?.levantada && ev.cancelable) ev.preventDefault() }
      const alTecla = (ev) => { if (ev.key === 'Escape') limpiar() }

      document.addEventListener('pointermove', alMover)
      document.addEventListener('pointerup', alSubir)
      document.addEventListener('pointercancel', alCancelar)
      document.addEventListener('touchmove', alTocarMover, { passive: false })
      window.addEventListener('keydown', alTecla)
      s.quitar = () => {
        document.removeEventListener('pointermove', alMover)
        document.removeEventListener('pointerup', alSubir)
        document.removeEventListener('pointercancel', alCancelar)
        document.removeEventListener('touchmove', alTocarMover)
        window.removeEventListener('keydown', alTecla)
      }
      if (!s.raton) s.temporizador = setTimeout(levantar, LARGO_MS)
    },
    // el menú contextual del móvil (y del botón derecho) saltaría justo cuando levantamos
    onContextMenu: (e) => e.preventDefault(),
    // tras un arrastre el navegador aún dispara el click: no abre la hoja de detalle
    onClickCapture: (e) => {
      if (!suprimirClick.current) return
      suprimirClick.current = false
      e.stopPropagation()
      e.preventDefault()
    },
  }), [colocar, levantar, soltar, limpiar])

  return { vuelo, fantasmaRef, props }
}
