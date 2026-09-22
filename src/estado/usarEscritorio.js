import { useEffect, useState } from 'react'

/**
 * ¿Estamos en escritorio? (LOGICA §10.0-9: a partir de 1024 px). Es lo único que decide
 * el armazón: el mismo motor y la misma capa de datos, otra disposición.
 *
 * Se lee con `matchMedia` y no con el ancho de la ventana para no re-renderizar en cada
 * píxel del redimensionado: el navegador avisa sólo cuando se cruza el umbral.
 */
export const CORTE_ESCRITORIO = 1024

export function usarEscritorio() {
  const [esEscritorio, setEsEscritorio] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(`(min-width: ${CORTE_ESCRITORIO}px)`).matches
      : false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const mq = window.matchMedia(`(min-width: ${CORTE_ESCRITORIO}px)`)
    const alCambiar = (e) => setEsEscritorio(e.matches)
    setEsEscritorio(mq.matches)
    mq.addEventListener('change', alCambiar)
    return () => mq.removeEventListener('change', alCambiar)
  }, [])

  return esEscritorio
}
