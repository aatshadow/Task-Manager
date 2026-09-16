import { Minus, Plus } from 'lucide-react'
import Selector from './Selector.jsx'
import { REGLAS, cadaN, reglaCadaN } from '../datos/repetir.js'

/**
 * «Repetir» (LOGICA §4.1): los cinco chips del vocabulario. Ninguno activo = nunca (volver a
 * tocar el activo lo quita, como el cuadrante). «Cada N días» es un solo chip para cualquier
 * `cada:N`; con él activo aparece el paso − N + debajo. Lo usan la captura rápida y la hoja.
 */
export default function SelectorRepetir({ valor, alCambiar, etiqueta = 'Repetir' }) {
  const n = cadaN(valor)
  const valorChips = n != null ? 'cada:3' : valor || null
  const opciones = REGLAS.map((r) => ({
    valor: r.clave,
    etiqueta: r.clave === 'cada:3' && n != null ? `Cada ${n} días` : r.nombre,
  }))
  // tocar «Cada N días» teniendo ya un cada:N no debe volver a 3
  const elegir = (v) => alCambiar(v === 'cada:3' && n != null ? valor : v)

  return (
    <div className="repetir">
      <Selector etiqueta={etiqueta} opciones={opciones} valor={valorChips} alCambiar={elegir} permitirVacio />
      {n != null && (
        <div className="repetir-cada" role="group" aria-label="Cada cuántos días">
          <span>Cada</span>
          <button type="button" className="repetir-paso" onClick={() => alCambiar(reglaCadaN(n - 1))} disabled={n <= 1} aria-label="Un día menos">
            <Minus size={14} strokeWidth={2} />
          </button>
          <span className="repetir-n">{n}</span>
          <button type="button" className="repetir-paso" onClick={() => alCambiar(reglaCadaN(n + 1))} disabled={n >= 999} aria-label="Un día más">
            <Plus size={14} strokeWidth={2} />
          </button>
          <span>{n === 1 ? 'día' : 'días'}</span>
        </div>
      )}
    </div>
  )
}
