import { motion, useDragControls } from 'framer-motion'
import { Clock } from 'lucide-react'
import Marca from '../../componentes/Marca.jsx'
import { useDatos } from '../../estado/useDatos.jsx'
import { usarGuardarTarea, usarPulsacion } from './ganchos.js'
import { esPeriodo, textoHoras } from './calendario.js'
import { textoFecha } from '../../datos/fechas.js'

/**
 * El día (`data-dia`) que hay bajo el puntero al soltar, o null si no se soltó sobre uno.
 * Se recorre la pila entera y no sólo el primer elemento: la propia fila arrastrada viaja
 * con el puntero y suele ser lo primero que hay debajo, y la celda del día está detrás.
 */
function diaBajo(evento) {
  const x = evento?.clientX ?? evento?.changedTouches?.[0]?.clientX
  const y = evento?.clientY ?? evento?.changedTouches?.[0]?.clientY
  if (x == null || y == null) return null
  const celda = document.elementsFromPoint(x, y).map((el) => el.closest('[data-dia]')).find(Boolean)
  return celda?.dataset.dia || null
}

/**
 * Una tarea en la lista de un día. Toque → hoja de detalle; la marca completa aquí mismo
 * (dos ejes, por la capa de datos). `fina` es la versión de barra para las que sólo
 * atraviesan el día (un período que vence más tarde).
 *
 * Con `alLevantar`/`alSoltar` la fila se puede mover de día: la pulsación larga la levanta
 * y arranca el arrastre (dragListener=false, para que el dedo siga pudiendo hacer scroll),
 * y al soltar se mira qué día hay debajo. Si el navegador se queda el gesto (en móvil el
 * scroll vertical gana), la fila sigue levantada y el padre acepta un toque en un día.
 */
export default function FilaTarea({ tarea: t, fina = false, levantada = false, alLevantar, alSoltar }) {
  const { abrirTarea, nombreProyecto, colorProyecto, nombreCategoria } = useDatos()
  const { completar } = usarGuardarTarea()
  const controles = useDragControls()
  const movible = !!alLevantar && !fina

  const color = colorProyecto(t) || 'var(--texto-3)'
  const proyecto = nombreProyecto(t)
  const categoria = nombreCategoria(t.categoria)
  const horas = textoHoras(t)
  const meta = [proyecto, categoria].filter(Boolean).join(' · ')

  const abrir = () => abrirTarea(t.id)
  const pulsacion = usarPulsacion({
    alToque: abrir,
    alLargo: movible ? (e) => { alLevantar(t); controles.start(e) } : undefined,
  })

  const clases = [
    'cal-fila',
    fina && 'cal-fila--fina',
    t.hecha && 'cal-fila--hecha',
    levantada && 'cal-fila--levantada',
  ].filter(Boolean).join(' ')

  const propsArrastre = movible ? {
    drag: true,
    dragControls: controles,
    dragListener: false,
    dragSnapToOrigin: true,
    dragElastic: 0.2,
    dragMomentum: false,
    onDragEnd: (e) => alSoltar?.(t, diaBajo(e)),
    whileDrag: { scale: 1.03, zIndex: 5 },
  } : {}

  return (
    <motion.div
      className={clases}
      role="button"
      tabIndex={0}
      // Sólo si el teclado está sobre la fila misma: Espacio sobre la Marca (que para el clic
      // pero no el keydown) completaría la tarea Y abriría la hoja.
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir() } }}
      style={{ '--cal-color': color }}
      {...propsArrastre}
      {...pulsacion}
    >
      {fina ? (
        <span className="cal-fila-barra" aria-hidden="true" />
      ) : (
        <Marca hecha={t.hecha} alCambiar={(si) => completar(t, si)} aria-label={t.hecha ? 'Reabrir' : 'Completar'} />
      )}
      <div className="cal-fila-textos">
        <div className="cal-fila-titulo">{t.titulo}</div>
        <div className="cal-fila-meta">
          {fina && esPeriodo(t) && <span>hasta el {textoFecha(t.vence)}</span>}
          {!fina && horas && <span className="cal-fila-hora"><Clock size={12} strokeWidth={1.75} />{horas}</span>}
          {meta && <span>{meta}</span>}
        </div>
      </div>
      {!fina && <span className="cal-fila-punto" aria-hidden="true" />}
    </motion.div>
  )
}
