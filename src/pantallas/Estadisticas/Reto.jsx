import { useMemo, useState } from 'react'
import Tarjeta from '../../componentes/Tarjeta.jsx'
import NumeroGrande from '../../componentes/NumeroGrande.jsx'
import Selector from '../../componentes/Selector.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import { diaDelReto } from '../../datos/retos.js'
import { rachaPerfectos, serieMedida } from '../../datos/habitos.js'
import { mapaCalorReto, resumenReto } from '../../datos/estadisticas.js'
import { textoFecha } from '../../datos/fechas.js'
import { num } from './calculos.js'
import { MapaCalor, LineaMedidaGrande } from './graficos.jsx'

/**
 * El bloque del reto en Stats (LOGICA §10.6): el mapa de calor de los 90 días, los
 * números (perfectos, racha, adherencia media, mejor semana), el mismo mapa por hábito
 * y las líneas de lo que se mide (peso, horas de sueño) con su objetivo punteado.
 *
 * Los días pasados salen de `hoy_dias` (que el cierre del día ya rellena con
 * `habitos_tocaban/hechos`); hoy, que aún no está cerrado, se calcula en vivo con
 * hábitos + marcas. Los días futuros van huecos: un día que no ha llegado no es un cero.
 */
export default function BloqueReto({ dias }) {
  const { reto, habitos, marcas, hoy } = useDatos()
  const [habitoId, setHabitoId] = useState('')

  const estado = useMemo(() => diaDelReto(reto, hoy), [reto, hoy])
  const habito = useMemo(() => habitos.find((h) => h.id === habitoId) || null, [habitos, habitoId])
  const mapa = useMemo(
    () => mapaCalorReto(habitos, marcas, reto, { dias: dias || [], hoy, habito }),
    [habitos, marcas, reto, dias, hoy, habito],
  )
  const resumen = useMemo(() => resumenReto(mapa), [mapa])
  const racha = useMemo(() => (reto ? rachaPerfectos(habito ? [habito] : habitos, marcas, hoy, reto.inicio) : 0), [habito, habitos, marcas, hoy, reto])

  // Lo que se mide: una línea por hábito `medir`, desde el inicio del reto.
  const medidos = useMemo(() => habitos
    .filter((h) => h.tipo === 'medir' && !h.archivadoEn)
    .map((h) => ({ habito: h, serie: reto ? serieMedida(h, marcas, reto.inicio, hoy) : [] })), [habitos, marcas, reto, hoy])

  if (!reto) return null

  return (
    <>
      <section className="seccion" style={{ marginTop: 0 }}>
        <h2 className="seccion-titulo">{reto.nombre}</h2>
        <Tarjeta compacta>
          <div className="reto-st-cabeza">
            <span className="reto-st-dia">
              {estado.antes ? `empieza en ${estado.faltan} ${estado.faltan === 1 ? 'día' : 'días'}` : `Día ${estado.dia}`}
              {!estado.antes && <span className="reto-st-total"> / {estado.total}</span>}
            </span>
            <Selector
              modo="desplegable"
              etiqueta=""
              valor={habitoId || 'todos'}
              alCambiar={(v) => setHabitoId(v === 'todos' ? '' : v)}
              opciones={[{ valor: 'todos', etiqueta: 'Todos los hábitos' }, ...habitos.filter((h) => !h.archivadoEn).map((h) => ({ valor: h.id, etiqueta: h.nombre }))]}
              className="reto-st-selector"
            />
          </div>
          <MapaCalor celdas={mapa} />
        </Tarjeta>
      </section>

      <section className="seccion">
        <div className="rejilla-2">
          <NumeroGrande valor={num(resumen.perfectos)} etiqueta="Días perfectos" variante="calida" />
          <NumeroGrande valor={num(racha)} sufijo={racha === 1 ? 'día' : 'días'} etiqueta="Racha de perfectos" />
          <NumeroGrande valor={resumen.diasPasados ? num(resumen.media) : '–'} sufijo={resumen.diasPasados ? '%' : undefined} etiqueta="Adherencia media" />
          <NumeroGrande
            valor={resumen.mejorSemana ? num(resumen.mejorSemana.porcentaje) : '–'}
            sufijo={resumen.mejorSemana ? '%' : undefined}
            etiqueta={resumen.mejorSemana ? `Mejor semana · ${textoFecha(resumen.mejorSemana.lunes, true)}` : 'Mejor semana'}
          />
        </div>
      </section>

      {medidos.map(({ habito: h, serie }) => (
        <section className="seccion" key={h.id}>
          <h2 className="seccion-titulo">{h.nombre}{h.unidad ? ` · ${h.unidad}` : ''}</h2>
          <Tarjeta compacta>
            {serie.length === 0
              ? <p className="st-vacio">Sin medidas todavía. Se apunta desde Hoy, en su hábito.</p>
              : <LineaMedidaGrande serie={serie} objetivo={h.objetivo} unidad={h.unidad} color={h.color} />}
          </Tarjeta>
        </section>
      ))}
    </>
  )
}

