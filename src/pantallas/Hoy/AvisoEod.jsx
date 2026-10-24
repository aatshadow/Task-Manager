import { useEffect, useState } from 'react'
import { MoonStar } from 'lucide-react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Boton from '../../componentes/Boton.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import { cargarEod, enHoraDeAviso, faltaEod } from '../../datos/eod.js'

const enLista = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs[0])

/**
 * El aviso del EOD sin rellenar (LOGICA §16.2): de las 19:30 al reinicio, si falta algo y el
 * día no se ha cerrado. Dice qué falta y lleva a la pestaña EOD.
 */
export default function AvisoEod({ alIr }) {
  const { hoy, ahora, ajustes, habitos, marcas } = useDatos()
  const reinicio = ajustes?.horaReinicio || '04:00'
  const toca = enHoraDeAviso(ahora, reinicio)
  const [eod, setEod] = useState(null)

  useEffect(() => {
    if (!toca) return undefined
    let vivo = true
    cargarEod(hoy).then((e) => vivo && setEod(e)).catch(() => {})
    return () => { vivo = false }
  }, [toca, hoy])

  if (!toca || !eod || eod.cerradoEn) return null
  const falta = faltaEod({ habitos, marcas, eod, preguntas: ajustes?.eodPreguntas || [], hoy })
  if (!falta.length) return null

  return (
    <Tarjeta compacta className="hoy-aviso-dia hoy-aviso-eod" role="status">
      <span className="hoy-aviso-icono"><MoonStar size={18} strokeWidth={1.75} /></span>
      <span className="hoy-aviso-texto"><b>EOD sin rellenar</b> · falta {enLista(falta)}</span>
      {alIr && <Boton pequeno onClick={alIr}>Rellenar</Boton>}
    </Tarjeta>
  )
}
