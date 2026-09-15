import { useEffect, useState } from 'react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import Campo from '../../componentes/Campo.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import * as catalogos from '../../datos/catalogos.js'
import { usarGuardarCatalogo } from './comun.jsx'

/**
 * El día: a qué hora se reinicia (antes de esa hora sigue siendo ayer), cuántos días sin
 * tocar mandan una tarea a la nevera y cuántos encienden la bandeja (LOGICA §3). Cada
 * campo guarda al soltar el foco; el «hoy» del contexto se recalcula solo cada minuto.
 */
export default function SeccionDia() {
  const { ajustes, setAjustes } = useDatos()
  const guardar = usarGuardarCatalogo()
  const [hora, setHora] = useState(ajustes?.horaReinicio || '04:00')
  const [nevera, setNevera] = useState(String(ajustes?.diasNevera ?? 30))
  const [bandeja, setBandeja] = useState(String(ajustes?.diasBandeja ?? 7))
  useEffect(() => {
    setHora(ajustes?.horaReinicio || '04:00')
    setNevera(String(ajustes?.diasNevera ?? 30))
    setBandeja(String(ajustes?.diasBandeja ?? 7))
  }, [ajustes])

  // Si la escritura falla, los campos vuelven a lo guardado: si no, lo tecleado parecería guardado.
  const reponer = () => {
    setHora(ajustes?.horaReinicio || '04:00')
    setNevera(String(ajustes?.diasNevera ?? 30))
    setBandeja(String(ajustes?.diasBandeja ?? 7))
  }
  const escribir = (cambios) => guardar(async () => { setAjustes(await catalogos.guardarAjustes(cambios)) }, { catalogos: false, alFallar: reponer })

  const soltarHora = () => {
    if (!/^\d{2}:\d{2}$/.test(hora)) { setHora(ajustes?.horaReinicio || '04:00'); return }
    if (hora !== ajustes?.horaReinicio) escribir({ horaReinicio: hora })
  }
  // Un número entero ≥ 0; si lo que hay no lo es, vuelve al valor guardado.
  const soltarDias = (texto, clave, actual, reponer) => {
    const n = Number.parseInt(texto, 10)
    if (!Number.isInteger(n) || n < 0) { reponer(String(actual)); return }
    if (n !== actual) escribir({ [clave]: n })
  }

  return (
    <section className="seccion">
      <div className="seccion-titulo">Día</div>
      <Tarjeta>
        <div className="ajustes-dia">
          <Campo
            etiqueta="Hora de reinicio"
            type="time"
            valor={hora}
            alCambiar={setHora}
            onBlur={soltarHora}
            ayuda="Antes de esta hora sigue siendo el día anterior. Al pasar, lo no hecho vuelve a Siguiente."
          />
          <Campo
            className="ajustes-dia-numero"
            etiqueta="Días de nevera"
            type="number"
            inputMode="numeric"
            min={0}
            valor={nevera}
            alCambiar={setNevera}
            onBlur={() => soltarDias(nevera, 'diasNevera', ajustes?.diasNevera ?? 30, setNevera)}
            ayuda="Sin tocar tantos días, sin fecha y fuera de Hoy, la tarea pasa a Algún día."
          />
          <Campo
            className="ajustes-dia-numero"
            etiqueta="Días de bandeja"
            type="number"
            inputMode="numeric"
            min={0}
            valor={bandeja}
            alCambiar={setBandeja}
            onBlur={() => soltarDias(bandeja, 'diasBandeja', ajustes?.diasBandeja ?? 7, setBandeja)}
            ayuda="Más de tantos días sin triar, la tarea se enciende."
          />
        </div>
      </Tarjeta>
    </section>
  )
}
