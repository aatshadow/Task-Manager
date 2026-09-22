import { useMemo } from 'react'
import { Flame } from 'lucide-react'
import { useDatos } from '../../estado/useDatos.jsx'
import { diaDelReto } from '../../datos/retos.js'
import { adherencia, rachaPerfectos } from '../../datos/habitos.js'

/**
 * La cabecera del reto (LOGICA §10.6): «Día N / 90 · Zero Agent Challenge», la adherencia
 * de hoy como barra fina y la racha de días perfectos. Antes del inicio dice cuándo
 * empieza; terminado, «90/90 · completado». Sin reto no se pinta nada.
 */
export default function CabeceraReto() {
  const { reto, habitos, marcas, hoy } = useDatos()
  const estado = useMemo(() => diaDelReto(reto, hoy), [reto, hoy])
  const adh = useMemo(() => adherencia(habitos, marcas, hoy), [habitos, marcas, hoy])
  const racha = useMemo(() => (reto ? rachaPerfectos(habitos, marcas, hoy, reto.inicio) : 0), [habitos, marcas, hoy, reto])
  if (!reto) return null

  if (estado.antes) {
    const cuando = estado.faltan === 1 ? 'mañana' : `en ${estado.faltan} días`
    return (
      <div className="reto reto--antes" role="status">
        <span className="reto-nombre">{reto.nombre}</span>
        <span className="reto-texto">empieza {cuando} a las 04:30</span>
      </div>
    )
  }

  const porcentaje = adh.tocaban ? Math.round((adh.hechos / adh.tocaban) * 100) : 0
  return (
    <div className={`reto${estado.terminado ? ' reto--terminado' : ''}`} role="status">
      <div className="reto-linea">
        <span className="reto-dia">Día {estado.dia} <span className="reto-total">/ {estado.total}</span></span>
        <span className="reto-nombre">{estado.terminado ? `${estado.total}/${estado.total} · completado` : reto.nombre}</span>
        <span className="reto-racha" title="Racha de días perfectos"><Flame size={13} strokeWidth={2} />{racha}</span>
      </div>
      <div className="reto-barra" aria-label={`Adherencia de hoy ${adh.hechos} de ${adh.tocaban}`}>
        <span className="reto-barra-relleno" style={{ width: `${porcentaje}%` }} />
      </div>
      <div className="reto-pie">
        <span>hoy {adh.hechos}/{adh.tocaban}</span>
        <span>{porcentaje} %</span>
      </div>
    </div>
  )
}
