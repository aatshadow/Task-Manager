import { rejillaSemanas, cumplimientoSemana } from '../../datos/habitos.js'
import { textoFecha } from '../../datos/fechas.js'

// Letras de los días como se leen en España (X = miércoles), lunes primero.
export const LETRAS_DIA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/**
 * Las últimas 4 semanas de un hábito: 28 celdas, lunes primero.
 *   · con marca → el color del hábito;
 *   · tocaba y no se marcó → apagada;
 *   · no tocaba → más apagada aún (no es un fallo, LOGICA §3.6);
 *   · futuro → casi invisible y sin botón: el futuro no se marca.
 * Con cadencia «X por semana» `tocaHoy` es true todos los días (el día da igual), así que
 * un día sin marca sólo es «fallo» si la semana NO llegó a su objetivo: una semana
 * cumplida se pinta entera como «no tocaba» (§3.6: un día que no tocaba no es un fallo).
 * Tocar una celda de hoy o de un día pasado marca/desmarca (`alAlternar(fecha, si)`).
 */
export default function RejillaHabito({ habito, marcas, hoy, alAlternar }) {
  const semanas = rejillaSemanas(habito, marcas, hoy, 4)
  const porSemana = habito.cadencia === 'semana'
  const celdas = semanas.flatMap((semana) => {
    const { hechas, objetivo } = porSemana ? cumplimientoSemana(habito, marcas, semana.map((c) => c.fecha)) : {}
    const cumplida = porSemana && hechas >= objetivo
    return semana.map((c) => ({ ...c, toca: c.toca && !cumplida, cumplida }))
  })
  return (
    <div className="rejilla" role="grid" aria-label={`Últimas 4 semanas de ${habito.nombre}`}>
      {LETRAS_DIA.map((l, i) => <div key={i} className="rejilla-dia" aria-hidden="true">{l}</div>)}
      {celdas.map((c) => {
        const clases = [
          'rejilla-celda',
          c.hecha && 'rejilla-celda--hecha',
          !c.hecha && c.toca && !c.futuro && 'rejilla-celda--toca',
          c.futuro && 'rejilla-celda--futuro',
          c.fecha === hoy && 'rejilla-celda--hoy',
        ].filter(Boolean).join(' ')
        const estado = c.hecha ? 'hecha' : c.futuro ? 'pendiente' : c.toca ? 'sin marcar' : c.cumplida ? 'semana cumplida' : 'no tocaba'
        const etiqueta = `${textoFecha(c.fecha, true)}: ${estado}`
        // Un día futuro no se marca: se pinta como caja muda, sin botón.
        if (c.futuro) return <div key={c.fecha} className={clases} role="gridcell" aria-label={etiqueta} />
        return (
          <button
            key={c.fecha}
            type="button"
            role="gridcell"
            className={clases}
            aria-label={etiqueta}
            aria-pressed={c.hecha}
            onClick={() => alAlternar?.(c.fecha, !c.hecha)}
          />
        )
      })}
    </div>
  )
}
