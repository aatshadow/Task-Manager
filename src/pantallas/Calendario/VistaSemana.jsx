import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MoveHorizontal } from 'lucide-react'
import CeldaDia from './CeldaDia.jsx'
import ListaDia from './ListaDia.jsx'
import { indicePorDia } from './calendario.js'
import { usarGuardarTarea } from './ganchos.js'
import { diasEntre, nombreDia, semanaDe } from '../../datos/fechas.js'

/**
 * Semana: tira de 7 días arriba (hoy en naranja, punto si hay tareas) y debajo la lista
 * del día elegido. A 430px no caben siete columnas de tarjetas legibles, así que la tira
 * es el selector y la lista es el contenido.
 *
 * Mover de día: pulsación larga sobre una fila la levanta; se arrastra hasta un día de la
 * tira o, si el navegador se quedó el gesto, se toca el día. Cualquier otro toque cancela.
 */
export default function VistaSemana({ tareas, fecha, hoy, estado = null, alElegir, alNueva }) {
  const semana = useMemo(() => semanaDe(fecha), [fecha])
  const indice = useMemo(() => indicePorDia(tareas, semana[0], semana[6]), [tareas, semana])
  const diaElegido = indice.get(fecha) || { vencen: [], periodo: [] }
  const { moverDeDia } = usarGuardarTarea()
  const [levantada, setLevantada] = useState(null)

  const mover = (t, dia) => {
    setLevantada(null)
    if (!dia || dia === t.vence) return
    moverDeDia(t, dia, diasEntre(t.vence, dia))
  }

  // Al soltar sin día debajo la fila se queda levantada esperando un toque en la tira;
  // un toque en cualquier otro sitio (o Escape) la baja.
  const alSoltar = (t, dia) => { if (dia) mover(t, dia) }
  useEffect(() => {
    if (!levantada) return
    const alPulsar = (e) => { if (!e.target.closest?.('[data-dia]')) setLevantada(null) }
    const alTecla = (e) => { if (e.key === 'Escape') setLevantada(null) }
    // en el siguiente tick: el pointerdown que levantó la fila no debe bajarla
    const id = setTimeout(() => {
      document.addEventListener('pointerdown', alPulsar)
      document.addEventListener('keydown', alTecla)
    }, 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('pointerdown', alPulsar)
      document.removeEventListener('keydown', alTecla)
    }
  }, [levantada])

  const elegir = (dia) => {
    if (levantada) mover(levantada, dia)
    else alElegir(dia)
  }

  return (
    <>
      <div className="cal-tira" role="grid" aria-label="Días de la semana">
        {semana.map((iso) => (
          <CeldaDia
            key={iso}
            fecha={iso}
            hoy={hoy}
            etiqueta={nombreDia(iso, true)}
            seleccionada={iso === fecha}
            destino={!!levantada && iso !== levantada.vence}
            dia={indice.get(iso)}
            alElegir={elegir}
            alNueva={alNueva}
          />
        ))}
      </div>

      <AnimatePresence>
        {levantada && (
          <motion.div
            className="cal-pista"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <MoveHorizontal size={16} strokeWidth={1.75} />
            <span>Suelta o toca el día al que va</span>
            <button className="cal-pista-cancelar" onClick={() => setLevantada(null)}>Cancelar</button>
          </motion.div>
        )}
      </AnimatePresence>

      <ListaDia
        fecha={fecha}
        dia={diaElegido}
        hoy={hoy}
        estado={estado}
        alNueva={() => alNueva(fecha)}
        levantadaId={levantada?.id || null}
        alLevantar={setLevantada}
        alSoltar={alSoltar}
      />
    </>
  )
}
